/**
 * 企業の生成/送信状態の分類。生成ページの「生成状態」フィルタで使う。
 * 状態は send_log（送信済みドメイン）と prospects（生成済みドメイン）を
 * 企業ドメインに突き合わせて1つに決める。
 */

/** 企業の生成/送信の状態。送信済み > 生成済み・未送信 > 未生成 の優先で1つに分類する */
export type GenStatus = "sent" | "generated" | "none";

/**
 * ドメイン先頭から剥がす代表的なサブドメイン接頭辞。
 * 採用/コーポレートで hp_url が recruit.example.com、連絡先メールが info@example.com のように
 * 別サブドメインになると、www 除去だけでは company.domain と send_log/prospect のドメインが一致せず
 * 「送信済みなのに未生成」と誤表示してしまう。よく使われる接頭辞に限って剥がして揃える
 * （example.co.jp のような eTLD を誤って削らないよう、既知の接頭辞のみを対象にする）。
 */
const SUBDOMAIN_PREFIXES =
  /^(?:www|recruit|recruiting|careers?|career|jobs?|saiyo|corp|corporate|company|info|about|hp|ir|en|ja|jp|global)\./;

/** company.domain と send_log/prospect のドメインを同じ規則で正規化して突き合わせる（小文字化＋既知サブドメイン接頭辞の除去） */
export const normGenDomain = (d: string | null | undefined): string => {
  let host = (d ?? "").trim().toLowerCase();
  // 代表的な接頭辞は複数段（recruit.www.example.com 等）に備えて繰り返し剥がす
  while (SUBDOMAIN_PREFIXES.test(host)) {
    host = host.replace(SUBDOMAIN_PREFIXES, "");
  }
  return host;
};

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
