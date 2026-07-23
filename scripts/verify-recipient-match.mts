/**
 * 宛先取り違え検知(danger-check)の誤検知修正の検証。
 * 「株式会社H4」と「株式会社H4（エイチフォー）」等（読み仮名注記・法人格ゆれ）は
 * 同一企業なのでブロックせず、本当に別会社の時だけブロックすることを確認する。
 */
import { upsertContact, getAllProspects } from "@/lib/db";
import { runDangerCheck } from "@/lib/danger-check";
import type { AnalysisResult } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;

/** 連絡先の登録社名(contactCompany)と本文の宛名企業(bodyCompany)で「差し込み間違い」ブロックが出るか */
function mismatchBlocked(tag: string, contactCompany: string, bodyCompany: string): boolean {
  const email = `rm-${tag}-${seed}@example.co.jp`;
  upsertContact({ company_name: contactCompany, email, source: "test" });
  const analysis: AnalysisResult = {
    company_name: bodyCompany, business_summary: "", activities: [], recent_topics: [],
    compatibility: { score: "medium", reason: "" }, proposal_points: [], hook: "",
  };
  const r = runDangerCheck({ subject: "ご提案", body: `${bodyCompany} ご担当者様\n本文`, analysis, toEmail: email });
  return r.blocks.some((b) => b.includes("差し込み間違い"));
}

// --- 誤検知しない（同一企業） ---
check("読み仮名注記違いはブロックしない（株式会社H4 vs 株式会社H4（エイチフォー））",
  mismatchBlocked("paren", "株式会社H4", "株式会社H4（エイチフォー）") === false);
check("法人格ゆれはブロックしない（株式会社A vs A株式会社）",
  mismatchBlocked("legal", "株式会社A", "A株式会社") === false);
check("完全一致はブロックしない",
  mismatchBlocked("same", "株式会社サンプル", "株式会社サンプル") === false);

// --- 本当の別会社はブロックする（保護は維持） ---
check("別会社はブロックする（インスパイア vs 岐阜武）",
  mismatchBlocked("real", "株式会社インスパイア", "株式会社 岐阜武") === true);
check("別法人格はブロックする（有限会社テスト vs 株式会社テスト）",
  mismatchBlocked("form", "有限会社テスト", "株式会社テスト") === true);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
