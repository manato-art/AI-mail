import {
  isEmailSuppressed,
  hasSentToEmail,
  getTodaySendCount,
  getSender,
  getAllSenders,
  DUPLICATE_SEND_BLOCK_DAYS,
} from "@/lib/db";
import type { SendGuardResult } from "@/lib/types";

const UNRESOLVED_VARIABLE_PATTERN = /\{\{[^}]+\}\}/g;

/**
 * 送信元がフリーメールの場合、そのドメインを自社扱いにすると
 * gmail.com 宛が全てブロックされてしまうため除外する。
 */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.co.jp",
  "yahoo.com",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.jp",
  "icloud.com",
  "me.com",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "i.softbank.jp",
  "nifty.com",
  "biglobe.ne.jp",
  "so-net.ne.jp",
  "ocn.ne.jp",
]);

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
  return [...subjectMatches, ...bodyMatches];
}

/** サブドメイン（mail.example.com）も自社扱いにする */
export function isOwnDomain(toEmail: string, ownDomains: string[]): boolean {
  const domain = toEmail.toLowerCase().split("@")[1];
  if (!domain) return false;
  return ownDomains.some((own) => domain === own || domain.endsWith(`.${own}`));
}

export function checkOwnDomainBlock(toEmail: string): boolean {
  return isOwnDomain(toEmail, getOwnDomains());
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
}): SendGuardResult {
  const reasons: string[] = [];

  // 抑止リスト照合は特定電子メール法上の義務。isFollowup でも決してスキップしない
  const suppression = isEmailSuppressed(params.toEmail);
  if (suppression) {
    reasons.push(
      `送信抑止リストに登録されています（理由: ${suppression.reason}、対象: ${suppression.target}）`
    );
  }

  const unresolvedVars = checkUnresolvedVariables(params.subject, params.body);
  if (unresolvedVars.length > 0) {
    reasons.push(
      `未解決の変数が残っています: ${unresolvedVars.join(", ")}`
    );
  }

  if (checkOwnDomainBlock(params.toEmail)) {
    reasons.push("自社・グループドメイン宛ての送信はブロックされています");
  }

  if (!checkSignaturePresent(params.body)) {
    reasons.push("署名ブロックが検出されません（特定電子メール法の表示義務）");
  }

  if (!params.isFollowup && hasSentToEmail(params.toEmail)) {
    reasons.push(`このアドレスには過去${DUPLICATE_SEND_BLOCK_DAYS}日以内に送信済みです（二重送信防止）`);
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

  if (!params.subject.trim()) {
    reasons.push("件名が空です");
  }

  if (!params.body.trim()) {
    reasons.push("本文が空です");
  }

  return {
    canSend: reasons.length === 0,
    reasons,
  };
}
