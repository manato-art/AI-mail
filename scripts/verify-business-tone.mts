/**
 * ビジネス文体の検証。
 * (1)生成プロンプト（自由生成 generate.ts / AIゾーン compose.ts）に「過度な感情表現・
 *    カジュアルな感想の禁止」制約が入っていること。
 * (2)validateEmail が、実際に出た『すごいと思います』『強く心を動かされました』等の
 *    カジュアル表現を検知すること。適切なビジネス文面は指摘しないこと。
 */
import { buildSystemPrompt } from "@/lib/generate";
import { buildZoneSystemPrompt } from "@/lib/compose";
import { validateEmail } from "@/lib/quality-check";
import type { AnalysisResult } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// 1. プロンプトにビジネス文体の制約が入っている
const genPrompt = buildSystemPrompt(false, {});
check("generate: 過度な感情表現の禁止が入る", genPrompt.includes("過度な感情表現") && genPrompt.includes("すごいと思います"));
check("generate: ファンレターでなくビジネス提案の明示", genPrompt.includes("ビジネス提案") || genPrompt.includes("ファンレター"));

const zonePrompt = buildZoneSystemPrompt(null);
check("AIゾーン: ビジネス文体厳守が入る", zonePrompt.includes("ビジネスメールの文体を厳守"));
check("AIゾーン: カジュアル例(すごいと思います)を明示禁止", zonePrompt.includes("すごいと思います") && zonePrompt.includes("心を動かされ"));
check("AIゾーン: ファンレター禁止の明示", zonePrompt.includes("ファンレター"));

// 2. validateEmail が実際のカジュアル文面を検知
const analysis = {
  company_name: "テスト株式会社",
  business_summary: "x", activities: ["a"], recent_topics: [],
  compatibility: { score: "high", reason: "r" }, proposal_points: ["p"], hook: "h",
} as AnalysisResult;

// ユーザーが実際に受け取ったNG文面（抜粋）
const gushy =
  "貴社のWebサイトを拝見し、「『できる』か『できないか』じゃない」という言葉に、強く心を動かされました。" +
  "体験型事業で一歩一歩前進されている姿勢、本当にすごいと思います。";
const rGushy = validateEmail(gushy, "テスト用の適切な長さの件名です", analysis, { fromTemplate: true });
check("カジュアル表現『すごい』を検知", rGushy.issues.some((i) => i.includes("すごい")));
check("カジュアル表現『心を動かされ』を検知", rGushy.issues.some((i) => i.includes("心を動かされ")));

// 3. 適切なビジネス文面はカジュアル指摘なし
const proper =
  "貴社の「情熱を伝播させる社会をつくる」という理念に深く共感しております。" +
  "体験型事業の取り組みに関心を持ち、当社のサービスがお役に立てると考えご連絡いたしました。";
const rProper = validateEmail(proper, "テスト用の適切な長さの件名です", analysis, { fromTemplate: true });
check("適切なビジネス文面はカジュアル指摘ゼロ", !rProper.issues.some((i) => i.includes("カジュアル")));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
