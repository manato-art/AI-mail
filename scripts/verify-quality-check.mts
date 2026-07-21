/**
 * 品質チェック握りつぶし対策の検証。
 * これまでAPIが返す qualityCheck を UI が捨てていたため、レビュー画面で
 * validateEmail を再計算して表示するようにした。その validateEmail が、
 * 握りつぶされていた各問題（企業名欠落・フック未反映・未解決変数・汎用表現・
 * 文字数逸脱）を実際に検出することを確認する。
 */
import { validateEmail } from "@/lib/quality-check";
import type { AnalysisResult } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const analysis: AnalysisResult = {
  company_name: "まるや商店",
  business_summary: "地域密着の小売",
  activities: ["店舗運営"],
  recent_topics: [],
  compatibility: { score: "high", reason: "合致" },
  proposal_points: ["採用強化"],
  hook: "新店舗オープンの取り組み",
} as AnalysisResult;

// 問題なしの本文（企業名・フック・商談誘導を含み、長さ200〜450字・変数もOK）
const goodBody =
  "まるや商店 ご担当者様\n\n突然のご連絡失礼いたします。株式会社サンプルの営業太郎と申します。" +
  "新店舗オープンの取り組みを拝見し、地域に根ざした姿勢に深く共感いたしました。" +
  "採用の初期接点づくりや店舗スタッフの募集において、弊社の採用支援サービスがお役に立てるのではと考えご連絡いたしました。" +
  "求人の露出から応募者との最初のやり取りまで、担当者が無理なく運用できる仕組みをご用意しております。" +
  "貴社の店舗展開のスピードに合わせて、必要な人材の確保を後押しできればと考えております。" +
  "まずは一度、オンラインでのご説明のお時間を15分ほど頂けますと幸いです。" +
  "ご検討のほどよろしくお願いいたします。";
const goodSubject = "まるや商店様への採用支援のご提案";

const good = validateEmail(goodBody, goodSubject, analysis);
check("問題なしの本文は passed=true / issues=0", good.passed && good.issues.length === 0);

// 企業名が入っていない
const noCompany = validateEmail(goodBody.replace(/まるや商店/g, "御社"), goodSubject.replace("まるや商店", "御社"), analysis);
check("企業名欠落を検出", noCompany.issues.some((i) => i.includes("相手企業名")));

// フックが反映されていない
const noHook = validateEmail(goodBody.replace("新店舗オープンの取り組みを拝見し、", ""), goodSubject, analysis);
check("フック未反映を検出", noHook.issues.some((i) => i.includes("フック")));

// 未解決変数が残っている
const withVar = validateEmail(goodBody + "\n{{sender_name}}", goodSubject, analysis);
check("未解決変数を検出", withVar.issues.some((i) => i.includes("未解決の変数")));

// 汎用表現
const generic = validateEmail(goodBody + "貴社のような企業様へ", goodSubject, analysis);
check("汎用的すぎる表現を検出", generic.issues.some((i) => i.includes("汎用的")));

// 商談誘導なし（商談系キーワードを全て除去）
const noCloseBody = goodBody.replace(/(打ち合わせ|ご説明|お時間|ミーティング|商談)/g, "");
const noClose = validateEmail(noCloseBody, goodSubject, analysis);
check("商談誘導の欠落を検出", noClose.issues.some((i) => i.includes("商談") || i.includes("打ち合わせ")));

// 文字数が短すぎる
const tooShort = validateEmail("まるや商店 新店舗オープンの取り組み ご説明", goodSubject, analysis);
check("本文が短すぎるのを検出", tooShort.issues.some((i) => i.includes("文字数")));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
