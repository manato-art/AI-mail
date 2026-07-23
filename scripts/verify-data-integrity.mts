/**
 * データ整合チェックの検証。
 * (1) companyNameAppearsOnSite: 登録社名がHP本文に現れるかの判定（誤爆回避の分岐込み）。
 * (2) 誤紐付け企業を revert すると連絡先が消え・ドメインnull・再調査(pending)へ戻ることを確認。
 */
import { companyNameAppearsOnSite } from "@/lib/data-integrity";
import {
  upsertCompany,
  upsertContact,
  markCompanyEnriched,
  setCompanyDomain,
  getCompanyById,
  getContactByEmail,
  getCompaniesForIntegrityCheck,
  revertCompanyForReinvestigation,
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

// --- (2) revert 統合（誤紐付け企業の是正） ---
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

revertCompanyForReinvestigation(company.id, "テスト是正");

check("revert後: 連絡先が削除されている", getContactByEmail(email) === undefined);
const after = getCompanyById(company.id);
check("revert後: enrichment_status が pending に戻る", after?.enrichment_status === "pending");
check("revert後: domain が null にクリアされる", after?.domain === null);
check("revert後: 対象抽出から外れる（pendingなので）",
  !getCompaniesForIntegrityCheck(9999).some((c) => c.id === company.id));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
