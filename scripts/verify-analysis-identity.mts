/**
 * #6 本体: resolveAnalysisForRecipient が「宛先とは別の会社の分析」を掴んで
 * 返さないことを検証する。共有ドメイン・フリーメール・同名異企業のケースで、
 * 誤った会社の analysis を返さない（= null か、正しい会社の分析のみ）ことを確認する。
 *
 * オンデマンド解決(step4)は検索APIを叩くため、テスト中は検索キーを一時的に
 * 空にして step4 を即例外化し、ネットワークに出ないようにする（finally で必ず復元）。
 */
import {
  createService,
  upsertCompany,
  markCompanyEnriched,
  findCompanyByDomain,
  countCompaniesByName,
  importCompaniesWithContacts,
  getSetting,
  setSetting,
  getAllCompanies,
  type ImportRow,
} from "@/lib/db";
import { resolveAnalysisForRecipient } from "@/lib/company-analysis";
import type { AnalysisResult } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllCompanies().length;
const svc = createService({ name: `idsvc-${seed}`, description: "d", strengths: "s", target: "t" });

/** upsertCompany + markCompanyEnriched で analysis 付きの企業を作る。company_name で識別する */
function seedCompany(name: string, domain: string, analysisName: string) {
  const c = upsertCompany({ name, domain, source: "test", source_detail: "identity test" });
  const analysis: AnalysisResult = {
    company_name: analysisName,
    business_summary: `summary of ${analysisName}`,
    activities: [],
    recent_topics: [],
    compatibility: { score: "medium", reason: "" },
    proposal_points: [],
    hook: "",
  };
  markCompanyEnriched(c.id, {
    hp_url: `https://${domain}`,
    recruit_page_url: null,
    business_summary: analysis.business_summary,
    fit_score: "medium",
    fit_reason: "",
    fit_service_id: svc.id,
    analysis_json: JSON.stringify(analysis),
  });
  return c;
}

/** step4 の例外を null に丸めて「別会社を返したか」だけを見る */
async function resolveSafe(company: string, email: string): Promise<AnalysisResult | null> {
  try {
    return await resolveAnalysisForRecipient(company, email, svc);
  } catch {
    return null;
  }
}

// --- step4(検索)を無効化してネットワークに出さない。値は finally で必ず戻す ---
const savedKey = getSetting("serper_api_key");
const savedMode = getSetting("search_mode");
setSetting("serper_api_key", "");
setSetting("search_mode", "api");
delete process.env.SERPER_API_KEY;

try {
  // 1. ドメイン一致・社名は法人格ゆれのみ → 正しい会社の分析を返す（誤ブロックしない）
  seedCompany(`株式会社アイデンティティ-${seed}`, `idok-${seed}.example.com`, `IDOK-${seed}`);
  const r1 = await resolveSafe(`アイデンティティ-${seed}`, `info@idok-${seed}.example.com`);
  check("法人格ゆれの社名+ドメイン一致 → 正しい分析を返す", r1?.company_name === `IDOK-${seed}`);

  // 2. 共有ドメイン・社名が食い違う → その会社の分析を返さない（#6の核）
  seedCompany(`親会社グループ-${seed}`, `grp-${seed}.example.com`, `WRONG-PARENT-${seed}`);
  const r2 = await resolveSafe(`無関係な子会社-${seed}`, `sub@grp-${seed}.example.com`);
  check("共有ドメイン+社名不一致 → 別会社の分析を返さない", r2?.company_name !== `WRONG-PARENT-${seed}`);

  // 3. フリーメールドメイン → ドメイン一致で企業同定しない
  const hadGmailCompany = !!findCompanyByDomain("gmail.com");
  if (!hadGmailCompany) {
    seedCompany(`フリーメール商店-${seed}`, "gmail.com", `WRONG-FREE-${seed}`);
  }
  const r3 = await resolveSafe("", `taro-${seed}@gmail.com`);
  check("フリーメール宛 → gmail.com の会社分析を返さない", r3?.company_name !== `WRONG-FREE-${seed}`);

  // 4. 社名なし＋独自ドメインが1社だけ → 宛先自身のドメインとして採用してよい（誤リジェクトしない）
  seedCompany(`ドメイン単独-${seed}`, `solo-${seed}.example.com`, `SOLO-${seed}`);
  const r4 = await resolveSafe("", `info@solo-${seed}.example.com`);
  check("社名なし+独自ドメイン一意 → その分析を返す", r4?.company_name === `SOLO-${seed}`);

  // 5. 同名異企業 → 社名一致だけで選ばず、宛先のドメインで正しい方を選ぶ
  seedCompany(`同名社-${seed}`, `nsa-${seed}.example.com`, `NSA-${seed}`);
  seedCompany(`同名社-${seed}`, `nsb-${seed}.example.com`, `NSB-${seed}`);
  check("同名が2社あることを検知", countCompaniesByName(`同名社-${seed}`) === 2);
  const r5 = await resolveSafe(`同名社-${seed}`, `x@nsb-${seed}.example.com`);
  check("同名異企業 → 宛先ドメインの会社(NSB)を返す", r5?.company_name === `NSB-${seed}`);
  check("同名異企業 → 別ドメインの会社(NSA)は返さない", r5?.company_name !== `NSA-${seed}`);

  // 6. 法人格が異なる別会社が共有ドメインにいる → step3で採用しない（#6-a）
  seedCompany(`ブランドX-${seed}合同会社`, `brandx-${seed}.example.com`, `WRONG-GK-${seed}`);
  const r6 = await resolveSafe(`ブランドX-${seed}株式会社`, `info@brandx-${seed}.example.com`);
  check("共有ドメイン+法人格違い(合同 vs 株式) → 別会社の分析を返さない", r6?.company_name !== `WRONG-GK-${seed}`);

  // 7. step1(連絡先→企業)のドメイン整合ガード:
  //    連絡先の企業ドメインが宛先メールのドメインと食い違えば採用しない（マージ誤紐付け対策）
  const impMismatch: ImportRow[] = [
    { name: `連絡先社-${seed}`, domain: `contactco-${seed}.example.com`, email: `taro@elsewhere-${seed}.example.com`, person_name: "太郎" },
  ];
  importCompaniesWithContacts(impMismatch, "test", "step1 mismatch");
  const cMis = findCompanyByDomain(`contactco-${seed}.example.com`)!;
  markCompanyEnriched(cMis.id, {
    hp_url: `https://contactco-${seed}.example.com`, recruit_page_url: null,
    business_summary: "x", fit_score: "medium", fit_reason: "", fit_service_id: svc.id,
    analysis_json: JSON.stringify({ company_name: `CONTACT-WRONG-${seed}`, business_summary: "x", activities: [], recent_topics: [], compatibility: { score: "medium", reason: "" }, proposal_points: [], hook: "" }),
  });
  const r7 = await resolveSafe("", `taro@elsewhere-${seed}.example.com`);
  check("step1: 連絡先企業のドメインが宛先と食い違えば採用しない", r7?.company_name !== `CONTACT-WRONG-${seed}`);

  // 8. step1 正常系: 連絡先企業のドメインが宛先メールのドメインと一致すれば採用する
  const impOk: ImportRow[] = [
    { name: `連絡先OK社-${seed}`, domain: `c1ok-${seed}.example.com`, email: `taro@c1ok-${seed}.example.com`, person_name: "太郎" },
  ];
  importCompaniesWithContacts(impOk, "test", "step1 ok");
  const cOk = findCompanyByDomain(`c1ok-${seed}.example.com`)!;
  markCompanyEnriched(cOk.id, {
    hp_url: `https://c1ok-${seed}.example.com`, recruit_page_url: null,
    business_summary: "x", fit_score: "medium", fit_reason: "", fit_service_id: svc.id,
    analysis_json: JSON.stringify({ company_name: `CONTACT-OK-${seed}`, business_summary: "x", activities: [], recent_topics: [], compatibility: { score: "medium", reason: "" }, proposal_points: [], hook: "" }),
  });
  const r8 = await resolveSafe("", `taro@c1ok-${seed}.example.com`);
  check("step1: 連絡先企業のドメインが宛先と一致すれば採用する", r8?.company_name === `CONTACT-OK-${seed}`);
} finally {
  // 検索設定を復元（テストで dev DB の検索キーを壊さない）
  setSetting("serper_api_key", savedKey ?? "");
  setSetting("search_mode", savedMode ?? "");
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
