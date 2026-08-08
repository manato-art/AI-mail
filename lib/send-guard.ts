import {
  isEmailSuppressed,
  hasSentToEmail,
  hasSentToCompanyDomain,
  getProspect,
  getTodaySendCount,
  getSender,
  getAllSenders,
  DUPLICATE_SEND_BLOCK_DAYS,
} from "@/lib/db";
import { FREE_EMAIL_DOMAINS } from "@/lib/email-domains";
import type { SendGuardResult } from "@/lib/types";

const UNRESOLVED_VARIABLE_PATTERN = /\{\{[^}]+\}\}/g;
const AI_ZONE_PREFIX = /^\{\{AI:/;

/**
 * 全角の波括弧で書かれた「変数のつもり」を検出する。
 *
 * なぜ要るか（2026-08-06・実際に3回起きた）:
 *   テンプレに `｛｛店舗HPのURL｝｝` と全角で書くと——
 *     1. VARIABLE_PATTERN（半角のみ）に一致しないので **置換されない**
 *     2. UNRESOLVED_VARIABLE_PATTERN も半角のみなので **未解決としても検知されない**
 *   結果、`｛｛店舗HPのURL｝｝` という文字列が**警告ゼロで顧客に届く**。
 *   「置換されない」より「置換されないことに誰も気づかない」方が悪い
 *   （KB silent-failure-cascade）。半角に直せというメッセージまで出す。
 *
 * 全角波括弧が日本語の営業メール本文に正当に現れることはまず無いので、
 * 誤検知より取りこぼしを恐れる側に倒す。
 */
const FULLWIDTH_VARIABLE_PATTERN = /[｛]{1,2}[^｝]*[｝]{1,2}/g;

/**
 * 全角波括弧の混入を返す（空配列＝問題なし）。件名・本文の両方を見る。
 */
export function checkFullwidthBraces(subject: string, body: string): string[] {
  const hits = [
    ...(subject.match(FULLWIDTH_VARIABLE_PATTERN) ?? []),
    ...(body.match(FULLWIDTH_VARIABLE_PATTERN) ?? []),
  ];
  return [...new Set(hits)];
}

/**
 * 商材ごとの禁止語（services.banned_phrases・改行/読点区切り）をパースする。
 * かってにHPでは「順位」「口コミを増や」等が法・通報リスクに直結する（NG-1/NG-10/R-TEST5）。
 */
export function parseBannedPhrases(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,、／/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2); // 1文字の禁止語は誤爆しかしない
}

/**
 * 照合用の正規化（2026-08-08 独立レビューで追加）。
 * 素の includes だと「順​位」（ゼロ幅スペース挟み）や全角英数で禁止語検知が外れる。
 * この文面はAI生成部分＝店のHP原文・クチコミ由来のテキストが通る場所なので、
 * 注入で意図的に細工される前提で照合する。NFKC で全半角を畳み、ゼロ幅類を除去する。
 */
export function normalizeForMatch(text: string): string {
  // U+200B..D ゼロ幅類 / U+2060 word joiner / U+FEFF BOM / U+00AD soft hyphen
  return text.normalize("NFKC").replace(/[​-‍⁠﻿­]/g, "");
}

/**
 * 禁止語の混入を返す（空配列＝問題なし）。正規化してから部分一致。
 * 誤検知の代償は「文面を直す」だけだが、取りこぼしの代償は通報・特電法違反なので厳しい側に倒す。
 */
export function checkBannedPhrases(subject: string, body: string, phrases: string[]): string[] {
  const text = normalizeForMatch(`${subject}\n${body}`);
  return phrases.filter((p) => text.includes(normalizeForMatch(p)));
}

// フリーメールドメイン（自社ドメイン誤ブロック除外に使う）は lib/email-domains に集約。

function parseEnvOwnDomains(): string[] {
  return (process.env.OWN_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * 接続済み送信者アカウントのドメイン。OWN_DOMAINS の設定漏れで
 * 自社ドメインブロックが丸ごと無効化されるのを防ぐフォールバック。
 */
function senderOwnDomains(): string[] {
  try {
    return getAllSenders()
      .map((s) => s.email.toLowerCase().split("@")[1])
      .filter((d): d is string => Boolean(d) && !FREE_EMAIL_DOMAINS.has(d));
  } catch {
    return [];
  }
}

export function getOwnDomains(): string[] {
  return [...new Set([...parseEnvOwnDomains(), ...senderOwnDomains()])];
}

export interface OwnDomainStatus {
  /** env・送信者アカウントのどちらからも1件も得られていない = ブロックが効いていない */
  isProtected: boolean;
  isEnvConfigured: boolean;
  domains: string[];
}

export function getOwnDomainStatus(): OwnDomainStatus {
  const domains = getOwnDomains();
  return {
    isProtected: domains.length > 0,
    isEnvConfigured: parseEnvOwnDomains().length > 0,
    domains,
  };
}

export function checkUnresolvedVariables(subject: string, body: string): string[] {
  const subjectMatches = subject.match(UNRESOLVED_VARIABLE_PATTERN) ?? [];
  const bodyMatches = body.match(UNRESOLVED_VARIABLE_PATTERN) ?? [];
  return [...subjectMatches, ...bodyMatches].filter((v) => !AI_ZONE_PREFIX.test(v));
}

/** サブドメイン（mail.example.com）も自社扱いにする */
export function isOwnDomain(toEmail: string, ownDomains: string[]): boolean {
  const domain = toEmail.toLowerCase().split("@")[1];
  if (!domain) return false;
  return ownDomains.some((own) => domain === own || domain.endsWith(`.${own}`));
}

export function checkOwnDomainBlock(toEmail: string): string | null {
  const domain = toEmail.toLowerCase().split("@")[1];
  if (!domain) return null;
  const ownDomains = getOwnDomains();
  const matched = ownDomains.find((own) => domain === own || domain.endsWith(`.${own}`));
  return matched ?? null;
}

export function checkSignaturePresent(body: string): boolean {
  return body.includes("━━━") || body.includes("---");
}

/** 住所らしき記載（郵便番号 or 都道府県） */
const ADDRESS_PATTERN =
  /〒\s*\d{3}|[都道府県]|北海道|東京都|大阪府|京都府/;
/** 問い合わせ先らしき記載（メールアドレス / 電話番号 / URL） */
const CONTACT_PATTERN =
  /[\w.+-]+@[\w-]+\.[\w.-]+|0\d{1,4}-\d{1,4}-\d{3,4}|0\d{9,10}|https?:\/\//;

/**
 * 特定電子メール法の必須表示事項が本文に含まれるかを確認する（仕様書F4の品質チェック）。
 * 法は「送信者の氏名・名称」「住所」「苦情・問い合わせを受け付ける連絡先」の表示を求める。
 *
 * 欠けていても送信自体は止めない（既存の署名が全て弾かれて運用が止まるため）。
 * 何が足りないかを警告として出し、人格の署名ブロックを直させる。
 */
export function checkLegalDisclosures(body: string, senderName?: string): string[] {
  const missing: string[] = [];

  const hasName = senderName
    ? body.includes(senderName)
    : /株式会社|有限会社|合同会社|Inc\.|Co\.,/.test(body);
  if (!hasName) missing.push("送信者の氏名・名称");
  if (!ADDRESS_PATTERN.test(body)) missing.push("住所");
  if (!CONTACT_PATTERN.test(body)) missing.push("問い合わせ先（メール・電話・URLのいずれか）");

  return missing;
}

export function runSendGuard(params: {
  toEmail: string;
  subject: string;
  body: string;
  senderId: number;
  prospectId?: number;
  /**
   * フォローアップ（同一スレッドの追撃・仕様書F12）は同じ宛先へ意図的に再送するため、
   * 二重送信ガードの対象外にする。抑止リスト照合など他のガードは常に適用される。
   */
  isFollowup?: boolean;
  /**
   * チェックが入っていたら「承知の上で押し切れる」警告をスキップする。
   * ただし抑止リストのうち本人由来（配信停止依頼・バウンス・返信での拒否）は
   * force でも絶対にスキップしない（特定電子メール法・二重の配信停止対応義務）。
   * AIが自動検出した営業お断り（refusal_detected）だけは誤検知があり得るため、
   * force で押し切れる（画面の抑止リストから手動解除する運用も可能）。
   */
  force?: boolean;
  /**
   * 商材の禁止語（parseBannedPhrases 済み）。混入は force でも押し切れない。
   * 「順位が上がる」等は法・通報リスクに直結し、承認して送るものではなく単に書いてはいけない。
   */
  bannedPhrases?: string[];
}): SendGuardResult {
  const reasons: string[] = [];

  // --- 抑止リスト照合: force でも本人由来の登録は絶対にブロックする ---
  const suppression = isEmailSuppressed(params.toEmail);
  if (suppression) {
    const forceableReason = suppression.reason === "refusal_detected";
    if (!params.force || !forceableReason) {
      reasons.push(
        `送信抑止リストに登録されています（理由: ${suppression.reason}、対象: ${suppression.target}）`
      );
      // 本人由来の抑止は他の警告と関係なく即座に送信不可を確定させる
      return { canSend: false, reasons };
    }
  }

  // --- force でも絶対に押し切れない「明確に壊れた送信」を先に弾く ---
  // {{変数}}が生のまま／件名・本文が空、は「承認して送る」ものではなく単に壊れている。
  // variables.ts はこのガードが未解決変数を弾く前提なので、force でも必ず適用する。
  const hardBlocks: string[] = [];
  const unresolvedVars = checkUnresolvedVariables(params.subject, params.body);
  if (unresolvedVars.length > 0) {
    hardBlocks.push(`未解決の変数が残っています: ${unresolvedVars.join(", ")}`);
  }
  // 全角の波括弧は「変数のつもりが置換されず、しかも未解決検知にも掛からない」状態。
  // 未解決変数と同じく「承認して送る」ものではなく単に壊れているので、force でも弾く
  const fullwidth = checkFullwidthBraces(params.subject, params.body);
  if (fullwidth.length > 0) {
    hardBlocks.push(
      `全角の波括弧が残っています（半角の {{ }} に直してください）: ${fullwidth.join(", ")}`
    );
  }
  if (!params.subject.trim()) hardBlocks.push("件名が空です");
  if (!params.body.trim()) hardBlocks.push("本文が空です");
  if (params.bannedPhrases?.length) {
    const banned = checkBannedPhrases(params.subject, params.body, params.bannedPhrases);
    if (banned.length > 0) {
      hardBlocks.push(`この商材の禁止語が含まれています: ${banned.join(", ")}`);
    }
  }
  if (hardBlocks.length > 0) {
    return { canSend: false, reasons: hardBlocks };
  }

  // --- ここから下は force（承知の上で送る）ならスキップ可能な警告 ---
  if (params.force) {
    return { canSend: reasons.length === 0, reasons };
  }

  const matchedDomain = checkOwnDomainBlock(params.toEmail);
  if (matchedDomain) {
    reasons.push(`自社ドメイン（${matchedDomain}）宛ての送信です`);
  }

  if (!checkSignaturePresent(params.body)) {
    reasons.push("署名ブロックが検出されません（特定電子メール法の表示義務）");
  }

  if (!params.isFollowup && hasSentToEmail(params.toEmail)) {
    reasons.push(`このアドレスには過去${DUPLICATE_SEND_BLOCK_DAYS}日以内に送信済みです（二重送信防止）`);
  }

  // 同じ会社の別アドレス（info@ と contact@ 等）・別ドメイン表記への重複送信を止める。
  // アドレス単位のガードだけでは素通りしていた（2026-07-27 同一企業への複数送信）。
  if (!params.isFollowup) {
    // prospectId は一括送信（送信直前に prospect を作る経路）では未指定。
    // その場合は宛先アドレスのドメインを会社の印として使う。
    const prospectDomain =
      params.prospectId !== undefined ? getProspect(params.prospectId)?.domain : undefined;
    const companyDomain = prospectDomain || (params.toEmail.split("@")[1] ?? "");
    if (hasSentToCompanyDomain(companyDomain) && !hasSentToEmail(params.toEmail)) {
      reasons.push(
        `この会社には過去${DUPLICATE_SEND_BLOCK_DAYS}日以内に別のアドレスで送信済みです（同一企業への重複送信防止）`
      );
    }
  }

  const sender = getSender(params.senderId);
  if (!sender) {
    reasons.push("送信者アカウントが見つかりません");
  } else {
    if (sender.auth_status !== "connected") {
      reasons.push(`送信者アカウントの認証状態が無効です（${sender.auth_status}）`);
    }
    if (sender.daily_limit > 0) {
      const todayCount = getTodaySendCount(params.senderId);
      if (todayCount >= sender.daily_limit) {
        reasons.push(
          `本日の送信上限に達しています（${todayCount}/${sender.daily_limit}通）`
        );
      }
    }
  }

  return {
    canSend: reasons.length === 0,
    reasons,
  };
}
