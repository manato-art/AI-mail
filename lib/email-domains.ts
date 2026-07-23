/**
 * フリーメール判定と社名の正規化・同一性判定。
 *
 * 送信ガード（自社ドメイン誤ブロック除外）と、一括送信の企業分析解決
 * （宛先と別会社の分析を掴まないための identity 照合）の両方から使う。
 * 「どのドメインをフリーメールとみなすか」を1箇所に集約する。
 */

/**
 * 個人が誰でも取得できるフリーメール／キャリアメールのドメイン。
 * これらは「特定企業のドメイン」ではないため、
 * ドメイン一致で企業を同定してはいけない（別会社の分析を掴む事故になる）。
 */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.co.jp",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.jp",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "i.softbank.jp",
  "nifty.com",
  "biglobe.ne.jp",
  "so-net.ne.jp",
  "ocn.ne.jp",
  "excite.co.jp",
  "infoseek.jp",
  "protonmail.com",
  "proton.me",
  "gmx.com",
]);

export function isFreeEmailDomain(domain: string | undefined | null): boolean {
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain.trim().toLowerCase().replace(/^www\./, ""));
}

function normalizeDomain(domain: string | undefined | null): string {
  return (domain ?? "").trim().toLowerCase().replace(/^www\./, "");
}

/**
 * 2つのドメインが同じ組織を指すとみなせるか（完全一致 or 一方が他方のサブドメイン）。
 * 「別会社の分析を宛先に貼り付けない」ための照合に使う。
 */
export function domainsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normalizeDomain(a);
  const nb = normalizeDomain(b);
  if (!na || !nb) return false;
  return na === nb || na.endsWith(`.${nb}`) || nb.endsWith(`.${na}`);
}

/**
 * 会社名を比較用に正規化する。
 * 法人格（株式会社・(株)・Inc. など）・空白・区切り記号の表記ゆれを吸収して、
 * 「株式会社サイバーワン」と「サイバーワン」を同一とみなせるようにする。
 */
export function normalizeCompanyName(name: string | undefined | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(
      /[（(]株[）)]|[（(]有[）)]|㈱|㈲|株式会社|有限会社|合同会社|合資会社|合名会社|株式會社|一般社団法人|公益社団法人|一般財団法人|公益財団法人|特定非営利活動法人/g,
      ""
    )
    .replace(/\b(?:inc|corp|corporation|company|co|ltd|limited|llc|k\.?k)\b\.?/gi, "")
    .replace(/[\s　]/g, "")
    .replace(/[.,、。・･／/\\|｜'"`’”“-]/g, "")
    .trim();
}

/**
 * 名前に明示されている日本語の法人格を正規化トークンで返す（無ければ null）。
 * 「サイバーワン合同会社」と「サイバーワン株式会社」のように、基幹名は同じでも
 * 法人格が明確に異なる別会社を、同一と誤判定しないための材料にする。
 */
function japaneseLegalForm(name: string): string | null {
  const forms: [RegExp, string][] = [
    [/株式会社|株式會社|[（(]株[）)]|㈱/, "kk"],
    [/有限会社|[（(]有[）)]|㈲/, "yugen"],
    [/合同会社/, "godo"],
    [/合資会社/, "goshi"],
    [/合名会社/, "gomei"],
    [/一般社団法人/, "ippan_shadan"],
    [/公益社団法人/, "koeki_shadan"],
    [/一般財団法人/, "ippan_zaidan"],
    [/公益財団法人/, "koeki_zaidan"],
    [/特定非営利活動法人/, "npo"],
  ];
  for (const [re, token] of forms) {
    if (re.test(name)) return token;
  }
  return null;
}

/**
 * 2つの社名が「同じ会社を指している」とみなせるか。
 * 別会社の分析を宛先に貼り付ける事故を防ぐための保守的な判定なので、
 * 法人格・表記ゆれを吸収した完全一致のみを同一とする（部分一致は誤判定を招くため採らない）。
 *
 * ただし基幹名が同じでも、両者に「明示された」日本語法人格があって異なる場合
 * （例: サイバーワン合同会社 と サイバーワン株式会社）は別法人とみなして不一致にする。
 * 片方だけ法人格を持つ／どちらも持たない場合は表記ゆれ（例: 株式会社サイバーワン と サイバーワン）
 * として一致を許す。
 */
export function companyNamesConsistent(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return false;
  if (na !== nb) return false;
  const fa = japaneseLegalForm(a ?? "");
  const fb = japaneseLegalForm(b ?? "");
  if (fa && fb && fa !== fb) return false;
  return true;
}

/** プレフィックス拡張とみなす際、共通の基幹名がこの長さ以上あることを要求する（短い偶然一致を弾く） */
const MIN_EXTENSION_BASE_LEN = 4;

/**
 * 一方の社名が他方に「部署・地域・法人形態」等の後置語を足しただけの拡張か
 * （＝同一企業とみなせるか）。
 * 例:「株式会社ウィルオブ・ワーク」と「株式会社ウィルオブ・ワーク システムインテグレーション事業部」、
 *   「BuzzFeed, Inc.」と「BuzzFeed Japan株式会社」。
 * 短い基幹名（例:「サン」）の偶然一致で別会社を同一と誤判定しないよう、基幹名の長さ下限を設ける。
 * 明示された日本語法人格が異なる（有限会社 vs 株式会社）場合は別法人として false。
 * ※ companyNamesConsistent（完全一致）より緩い。宛先取り違え検知のような
 *   「同一企業なら誤爆させたくない」用途で使う。名寄せ・分析引き当てのような厳密同定には使わない。
 */
export function companyNameIsExtension(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb || na === nb) return false; // 完全一致は companyNamesConsistent の領分
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length < MIN_EXTENSION_BASE_LEN) return false;
  if (!long.startsWith(short)) return false;
  const fa = japaneseLegalForm(a ?? "");
  const fb = japaneseLegalForm(b ?? "");
  if (fa && fb && fa !== fb) return false;
  return true;
}
