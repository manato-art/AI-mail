/**
 * テンプレート最優先の検証。
 * テンプレートを指定したときは、トーン/文章量/CTA の既定指示（文字数枠・CTA種別）を
 * システムプロンプトに注入せず、テンプレートが構成を管理することを確認する。
 * 逆にテンプレート未指定なら従来どおりトーン/文章量/CTA が入る。
 */
import { buildSystemPrompt } from "@/lib/generate";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// 文章量マップ・CTAマップに出る特徴的な文字列（注入されたら含まれる）
const LENGTH_MARKERS = ["本文200字前後", "本文300字前後", "本文450字前後"];
const CTA_MARKERS = ["気軽なオンライン商談を提案", "電話での簡単な説明を提案", "まずは資料送付を提案", "セミナーやウェビナー"];
const TONE_HEADER = "【トーン】";

// --- テンプレート未指定（自由生成）: トーン/文章量/CTA が入る ---
const free = buildSystemPrompt(false, { tone: "friendly", length: "long", cta: "phone" });
check("自由生成: 【トーン】が入る", free.includes(TONE_HEADER));
check("自由生成: 文章量(450字)が入る", free.includes("本文450字前後"));
check("自由生成: CTA(電話)が入る", CTA_MARKERS.some((m) => free.includes(m)));
check("自由生成: 本文構成の型が入る", free.includes("【本文構成の型】"));

// --- テンプレート指定: トーン/文章量/CTA を注入しない ---
const tmpl = buildSystemPrompt(false, {
  tone: "friendly",
  length: "long",
  cta: "phone",
  templateSubject: "【ご提案】{{company}}様へ",
  templateBody: "突然のご連絡失礼します。きっかけインターンのご案内です。",
});
check("テンプレ: 【トーン】を注入しない", !tmpl.includes(TONE_HEADER));
check("テンプレ: 文章量マップを注入しない", !LENGTH_MARKERS.some((m) => tmpl.includes(m)));
check("テンプレ: CTAマップを注入しない", !CTA_MARKERS.some((m) => tmpl.includes(m)));
check("テンプレ: 『テンプレート最優先』の指示が入る", tmpl.includes("テンプレート最優先"));
check("テンプレ: テンプレ本文がプロンプトに入る", tmpl.includes("きっかけインターンのご案内"));
check("テンプレ: 絶対ルール(宛名・署名)は維持される", tmpl.includes("【絶対ルール") && tmpl.includes("署名"));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
