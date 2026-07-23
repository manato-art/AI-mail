/**
 * 企業の生成/送信状態の分類。生成ページの「生成状態」フィルタで使う。
 * 状態は send_log（送信済みドメイン）と prospects（生成済みドメイン）を
 * 企業ドメインに突き合わせて1つに決める。
 */

/** 企業の生成/送信の状態。送信済み > 生成済み・未送信 > 未生成 の優先で1つに分類する */
export type GenStatus = "sent" | "generated" | "none";

/** company.domain と send_log/prospect のドメインを同じ規則で正規化して突き合わせる（www除去・小文字化） */
export const normGenDomain = (d: string | null | undefined): string =>
  (d ?? "").trim().toLowerCase().replace(/^www\./, "");

/**
 * ドメイン集合との突き合わせで企業の生成/送信状態を1つに分類する。
 * 送信済みドメインを最優先（送信済みなら再送を避けたい）、次に生成済み、どちらでもなければ未生成。
 */
export function classifyGenStatus(
  domain: string | null | undefined,
  sentDomains: Set<string>,
  generatedDomains: Set<string>
): GenStatus {
  const d = normGenDomain(domain);
  if (!d) return "none";
  if (sentDomains.has(d)) return "sent";
  if (generatedDomains.has(d)) return "generated";
  return "none";
}
