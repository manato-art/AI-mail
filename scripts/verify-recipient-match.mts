/**
 * 宛先取り違え検知(danger-check)の誤検知修正の検証。
 * 「株式会社H4」と「株式会社H4（エイチフォー）」等（読み仮名注記・法人格ゆれ）は
 * 同一企業なのでブロックせず、本当に別会社の時だけブロックすることを確認する。
 * さらに、宛先ドメインが分析元企業のドメインと一致するなら、社名の表記ゆれ
 * （スタメン↔stmn、A↔A Inc. 等のローマ字↔カナ・略称）を許容することを確認する。
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

/** 宛先ドメイン(emailDomain)と分析元ドメイン(companyDomain)を明示して照合する版 */
function mismatchBlockedDomain(
  tag: string, contactCompany: string, bodyCompany: string, emailDomain: string, companyDomain: string
): boolean {
  const email = `rmd-${tag}-${seed}@${emailDomain}`;
  upsertContact({ company_name: contactCompany, email, source: "test" });
  const analysis: AnalysisResult = {
    company_name: bodyCompany, business_summary: "", activities: [], recent_topics: [],
    compatibility: { score: "medium", reason: "" }, proposal_points: [], hook: "",
  };
  const r = runDangerCheck({
    subject: "ご提案", body: `${bodyCompany} ご担当者様\n本文`, analysis, toEmail: email, companyDomain,
  });
  return r.blocks.some((b) => b.includes("差し込み間違い"));
}

// --- 誤検知しない（同一企業） ---
check("読み仮名注記違いはブロックしない（株式会社H4 vs 株式会社H4（エイチフォー））",
  mismatchBlocked("paren", "株式会社H4", "株式会社H4（エイチフォー）") === false);
check("法人格ゆれはブロックしない（株式会社A vs A株式会社）",
  mismatchBlocked("legal", "株式会社A", "A株式会社") === false);
check("完全一致はブロックしない",
  mismatchBlocked("same", "株式会社サンプル", "株式会社サンプル") === false);

// --- 部署/地域/法人形態の後置語違いは同一企業（ドメイン無しでも） ---
check("部署名付き登録は同一企業（ウィルオブ・ワーク システムインテグレーション事業部）",
  mismatchBlocked("dept", "株式会社ウィルオブ・ワーク　システムインテグレーション事業部", "株式会社ウィルオブ・ワーク") === false);
check("地域/法人違いでも基幹名一致は同一企業（BuzzFeed Japan株式会社 vs BuzzFeed, Inc.）",
  mismatchBlocked("buzz", "BuzzFeed Japan株式会社", "BuzzFeed, Inc.") === false);
check("短い基幹名の偶然プレフィックスは別会社扱い（サン vs サンリオ）",
  mismatchBlocked("short", "サン", "サンリオ") === true);

// --- ドメイン一致なら表記ゆれ（ローマ字↔カナ・略称）を許容 ---
check("同ドメインなら スタメン↔stmn を通す（誤ブロック解消）",
  mismatchBlockedDomain("stmn", "株式会社stmn", "株式会社スタメン", "stmn-t.co.jp", "stmn-t.co.jp") === false);
check("同ドメインなら A Inc.↔株式会社A / A Inc. を通す",
  mismatchBlockedDomain("ainc", "A Inc.", "株式会社A / A Inc.", "ace-t.com", "ace-t.com") === false);
check("サブドメイン宛でも同一企業として通す",
  mismatchBlockedDomain("sub", "株式会社stmn", "スタメン", "mail.stmn2-t.co.jp", "stmn2-t.co.jp") === false);

// --- 本当の別会社はブロックする（保護は維持） ---
check("別会社はブロックする（インスパイア vs 岐阜武）",
  mismatchBlocked("real", "株式会社インスパイア", "株式会社 岐阜武") === true);
check("別法人格はブロックする（有限会社テスト vs 株式会社テスト）",
  mismatchBlocked("form", "有限会社テスト", "株式会社テスト") === true);
check("別ドメイン宛は表記ゆれでもブロック（本当の取り違え・保護維持）",
  mismatchBlockedDomain("cross", "株式会社インスパイア", "株式会社岐阜武", "gifutake-t.net", "inspire-t.com") === true);
check("フリーメールはドメイン照合せず名前でブロック（gmail等）",
  mismatchBlockedDomain("free", "株式会社stmn", "株式会社スタメン", "gmail.com", "gmail.com") === true);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
