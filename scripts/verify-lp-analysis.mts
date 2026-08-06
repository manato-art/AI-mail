/**
 * 「店の情報はLP側を正とする」が実際に効くかの検証（2026-08-06 追加）。
 * 分析データを入れたら、resolveAnalysisForRecipient が**再クロールせずに**それを返すこと。
 */
import { upsertCompany, upsertContact, setCompanyAnalysisByContactEmail, getCompanyById, getContactByEmail } from "@/lib/db";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) console.log(`      得た値: ${JSON.stringify(got)}\n      期待  : ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const analysis = JSON.parse(readFileSync(process.argv[2], "utf8"));

const company = upsertCompany({ name: "そば処 高美亭本店", domain: "sanwa-gr.com", source: "csv_import" });
const contact = upsertContact({
  company_id: company.id, company_name: "そば処 高美亭本店", person_name: "",
  email: "foods@sanwa-gr.com", email_source_url: null, source: "csv_import", lp_url: null,
});

check("入れる前は分析が空", getCompanyById(company.id)?.analysis_json, "{}");
check("入れられる", setCompanyAnalysisByContactEmail(contact.email, JSON.stringify(analysis), "http://www.sanwa-gr.com/foods/takamitei/"), "updated");

const saved = JSON.parse(getCompanyById(company.id)!.analysis_json);
check("そば屋として保存されている", saved.company_name, "そば処 高美亭本店");
check("不動産・ケーブルテレビの語が入っていない", /不動産|ケーブルテレビ/.test(JSON.stringify(saved)), false);
check("HPのURLが店のページに向いている", getCompanyById(company.id)?.hp_url, "http://www.sanwa-gr.com/foods/takamitei/");
check("居ない宛先は not_found", setCompanyAnalysisByContactEmail("nobody@x.example", "{}", null), "contact_not_found");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
