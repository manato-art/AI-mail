/**
 * データ整合チェックの検証。
 * (1) companyNameAppearsOnSite: 登録社名がHP本文に現れるかの判定
 *     （NFKC全角半角ゆれ吸収・拠点後置語の救済・誤爆回避の分岐込み）。
 * (2) 誤紐付け企業は「除外（非破壊）」で送信対象から外れ、連絡先は消えない・対象抽出から外れる。
 */
import { companyNameAppearsOnSite } from "@/lib/data-integrity";
import {
  upsertCompany,
  upsertContact,
  markCompanyEnriched,
  markCompanyExcluded,
  setCompanyDomain,
  getCompanyById,
  getContactByEmail,
  getCompaniesForIntegrityCheck,
} from "@/lib/db";
import type { CrawlPage } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const page = (title: string, text: string): CrawlPage => ({ url: "https://x", title, text });

// --- (1) companyNameAppearsOnSite ---
check("本文に社名あり → 一致(true)",
  companyNameAppearsOnSite("株式会社岐阜武", [page("トップ", "株式会社岐阜武の公式サイトです")]) === true);
check("タイトルだけに社名あり → 一致(true)",
  companyNameAppearsOnSite("岐阜武商店", [page("岐阜武商店 | 公式", "本文にはロゴのみ")]) === true);
check("法人格ゆれでも一致（登録=株式会社岐阜武 / HP=岐阜武 商店）",
  companyNameAppearsOnSite("株式会社岐阜武", [page("", "ようこそ岐阜武 商店へ")]) === true);
check("社名がHPに全く無い → 不一致(false)＝誤紐付け疑い",
  companyNameAppearsOnSite("株式会社インスパイア", [page("岐阜武 商店", "岐阜武の通販サイトです。お問い合わせはこちら")]) === false);
check("短すぎる社名(H4)は判定対象外 → true（消さない）",
  companyNameAppearsOnSite("H4", [page("別会社", "まったく無関係の内容")]) === true);
check("ページ無し → 判定不能 → true（消さない）",
  companyNameAppearsOnSite("株式会社インスパイア", []) === true);
// NFKC 全角半角ゆれ吸収（誤削除の主因を潰す）
check("全角ラテン ＡＢＣ株式会社 vs 本文 ABC Inc. → 一致(true)",
  companyNameAppearsOnSite("ＡＢＣ株式会社", [page("", "ABC Inc. へようこそ")]) === true);
check("半角カナ ｶﾌﾞｼｷ商会 vs 本文 カブシキ商会 → 一致(true)",
  companyNameAppearsOnSite("ｶﾌﾞｼｷ商会", [page("", "カブシキ商会です")]) === true);
check("全角数字 システム１２３ vs 本文 システム123 → 一致(true)",
  companyNameAppearsOnSite("システム１２３", [page("", "システム123の紹介")]) === true);
// 収集時に付いた拠点後置語の救済
check("登録名の拠点後置語(東京本社)を剥がせば一致 → true",
  companyNameAppearsOnSite("株式会社テストワークス 東京本社", [page("", "株式会社テストワークスの公式")]) === true);

// --- (2) 除外（非破壊）統合 ---
const company = upsertCompany({
  name: `整合テスト商事${getCompaniesForIntegrityCheck(9999).length}`,
  domain: "integrity-test-example.net",
  source: "test",
  hp_url: "https://integrity-test-example.net",
});
markCompanyEnriched(company.id, { hp_url: "https://integrity-test-example.net" });
setCompanyDomain(company.id, "integrity-test-example.net");
const email = `contact-${company.id}@integrity-test-example.net`;
upsertContact({ company_id: company.id, company_name: company.name, email, source: "test" });

check("対象抽出に含まれる（done・HP有・連絡先有）",
  getCompaniesForIntegrityCheck(9999).some((c) => c.id === company.id));

markCompanyExcluded(company.id, "社名不一致（テスト）");

check("除外後: 連絡先は削除されず保持される（非破壊）", getContactByEmail(email) !== undefined);
const after = getCompanyById(company.id);
check("除外後: enrichment_status が excluded になる", after?.enrichment_status === "excluded");
check("除外後: ドメインは保持される（非破壊・復旧可能）", after?.domain === "integrity-test-example.net");
check("除外後: 対象抽出から外れる（doneでないので）",
  !getCompaniesForIntegrityCheck(9999).some((c) => c.id === company.id));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
