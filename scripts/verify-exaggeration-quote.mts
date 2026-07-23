/**
 * 誇大表現(景表法)警告の誤検知修正の検証。
 * 相手企業のページを「引用」した中の誇大ワード(No.1等)は警告せず、
 * 自社の断定・帰属の無い括りは従来どおり警告することを確認する。
 */
import { runDangerCheck } from "@/lib/danger-check";
import type { AnalysisResult } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const analysis: AnalysisResult = {
  company_name: "テスト社", business_summary: "", activities: [], recent_topics: [],
  compatibility: { score: "medium", reason: "" }, proposal_points: [], hook: "",
};

function exaggerationWarned(body: string): boolean {
  const r = runDangerCheck({ subject: "ご提案", body, analysis });
  return r.warnings.some((w) => w.includes("誇大表現") || w.includes("景品表示法"));
}

// 相手ページの引用（貴社/記載/拝見の帰属あり）内の No.1 は警告しない
check("相手ページ引用内のNo.1は警告しない",
  exaggerationWarned(
    "貴社のRecruitページに「EC市場のNo.1となるには仲間が足りません」と記載されているのを拝見しました。"
  ) === false);

// 自社の断定は従来どおり警告する（保護維持）
check("自社の断定 No.1 は警告する",
  exaggerationWarned("弊社は業界No.1のサービスです。") === true);

// 帰属の無い「」括りは残す（保守：自社主張の可能性）
check("帰属の無い「No.1」括りは警告する（保守）",
  exaggerationWarned("「No.1」を目指します。") === true);

// 引用でも帰属が別ワード（サイトに記載）ならOK
check("『御社サイトに「日本一の実績」と記載』は警告しない",
  exaggerationWarned("御社サイトに「日本一の実績」と記載があり感銘を受けました。") === false);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
