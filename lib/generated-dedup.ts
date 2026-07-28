/**
 * 「生成済みメールを各社へ送る」一覧の、会社単位の重複判定。
 *
 * 守りたい実体は「会社」であって「メールアドレス」ではない（KB-2026-07-27-001）。
 * サーバ側の重複ガード（lib/db.ts の getSentCompanyDomains / hasSentToCompanyDomain）と
 * 同じ会社キー（companyDomainKey）で判定することで、
 * 「画面では送れるのに送信するとブロックされる」食い違いを無くす。
 *
 * 画面（React）から使うので DB にも fs にも依存しない純関数だけを置く。
 */
import { companyDomainKey } from "./email-domains";

/** 判定に必要な最小限の形。Prospect はこの形を満たす */
export interface DedupRow {
  id: number;
  domain: string;
  emails_found_json: string | null;
  send_status: string;
  /** 予約済みの行が実際に送る宛先（予約でなければ null） */
  scheduled_to_email?: string | null;
}

/** 生成済みメールに紐づく送信先メール（HP分析時に見つけたもの）を1件返す */
export function firstEmailFromJson(json: string | null | undefined): string | null {
  try {
    const emails: unknown = json ? JSON.parse(json) : [];
    if (!Array.isArray(emails)) return null;
    return (emails.find((e) => typeof e === "string" && e.includes("@")) as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** "user@example.co.jp" でも "example.co.jp" でもホスト部分を返す */
function hostOf(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  return value.includes("@") ? value.split("@")[1] ?? "" : value;
}

/**
 * この行が指す「会社の印」。宛先メールのドメインと企業ドメインの両方を印として扱う
 * （サーバ側 getSentCompanyDomains と同じ考え方）。
 *
 * フリーメール・公開サフィックス（co.jp 等）は会社の印にならないので落ちる。
 * 1つも取れないときだけ、従来通り宛先アドレスそのものを鍵にする
 * （gmail 宛など。ここでドメインを削って co.jp を鍵にすると無関係な会社を巻き込む）。
 */
export function companyKeysOf(row: DedupRow): string[] {
  const email = firstEmailFromJson(row.emails_found_json);
  const keys = new Set<string>();
  for (const raw of [email, row.scheduled_to_email, row.domain]) {
    const key = companyDomainKey(hostOf(raw));
    if (key) keys.add(key);
  }
  if (keys.size > 0) return [...keys];
  return email ? [`email:${email.trim().toLowerCase()}`] : [];
}

export interface HandledCompanies {
  /** 既に1通でも送った会社の印 */
  sent: Set<string>;
  /** 送信予約が入っている会社の印 */
  scheduled: Set<string>;
}

/** 全生成メールから「もう対応済みの会社」を集める。絞り込み後ではなく必ず全件から作る */
export function buildHandledCompanies(rows: DedupRow[]): HandledCompanies {
  const sent = new Set<string>();
  const scheduled = new Set<string>();
  for (const row of rows) {
    if (row.send_status !== "sent" && row.send_status !== "scheduled") continue;
    const target = row.send_status === "sent" ? sent : scheduled;
    for (const key of companyKeysOf(row)) target.add(key);
  }
  return { sent, scheduled };
}

/** 送れない理由。画面のバッジ文言と1対1で対応する */
export type SkipReason = "company-sent" | "company-scheduled" | "older-duplicate";

export interface SelectionResult<T> {
  /** 実際に送ってよい行（会社ごとに最新の1件だけ） */
  sendable: T[];
  /** 送らない行と、その理由 */
  skipped: Map<number, SkipReason>;
}

/**
 * 作成日時の新しい順に並んだ行から、送信対象を選ぶ。
 * - その会社に既に送信/予約済みなら送らない（ユーザー決定: 同じ会社には1回だけ）
 * - 同じ会社の古い生成メールは送らない（各社の最新1件だけ）
 * - メアドが無い行は送信対象にならない（理由は付けない。画面に「メアド無し」を出すため）
 */
export function selectSendableRows<T extends DedupRow>(
  rows: T[],
  handled: HandledCompanies
): SelectionResult<T> {
  const seen = new Set<string>();
  const sendable: T[] = [];
  const skipped = new Map<number, SkipReason>();

  for (const row of rows) {
    // 行そのものが送信済み・予約済みなら選別の対象外（画面では専用バッジで示す）
    if (row.send_status === "sent" || row.send_status === "scheduled") continue;
    if (!firstEmailFromJson(row.emails_found_json)) continue;

    const keys = companyKeysOf(row);
    if (keys.some((k) => handled.sent.has(k))) {
      skipped.set(row.id, "company-sent");
      continue;
    }
    if (keys.some((k) => handled.scheduled.has(k))) {
      skipped.set(row.id, "company-scheduled");
      continue;
    }
    if (keys.some((k) => seen.has(k))) {
      skipped.set(row.id, "older-duplicate");
      continue;
    }
    for (const key of keys) seen.add(key);
    sendable.push(row);
  }

  return { sendable, skipped };
}
