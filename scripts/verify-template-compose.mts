/**
 * テンプレを compose エンジンで処理する修正の検証。
 * Part1: validateEmail({fromTemplate}) がテンプレ時に文字数・フック・商談誘導・件名長を
 *        外し、企業名・未解決変数などの実害チェックは残すこと。
 * Part2: composeBody がテンプレの固定文を一字一句保持し、{{company_name}}/{{person_name}} を
 *        実値に置換し、{{AI:}} ゾーンだけ生成すること（モックAnthropic経由）。
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import { validateEmail } from "@/lib/quality-check";
import type { AnalysisResult } from "@/lib/types";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// ---------- Part 1: quality-check fromTemplate ----------
const analysis = {
  company_name: "まるや商店",
  business_summary: "小売",
  activities: ["店舗運営"],
  recent_topics: [],
  compatibility: { score: "high", reason: "合致" },
  proposal_points: ["採用強化"],
  hook: "新店舗オープンの取り組み",
} as AnalysisResult;

// 企業名は含むが、フックなし・商談誘導なし・長すぎ・件名短すぎ、の本文
const longBody = "まるや商店\n山田様\n\n" + "あ".repeat(500) + "\n\n署名";
const shortSubject = "ご提案"; // 3字（下限15字未満）

const withTmpl = validateEmail(longBody, shortSubject, analysis, { fromTemplate: true });
check("テンプレ: 文字数を指摘しない", !withTmpl.issues.some((i) => i.includes("文字数")));
check("テンプレ: フックを指摘しない", !withTmpl.issues.some((i) => i.includes("フック")));
check("テンプレ: 商談誘導を指摘しない", !withTmpl.issues.some((i) => i.includes("商談") || i.includes("打ち合わせ")));
check("テンプレ: 件名長を指摘しない", !withTmpl.issues.some((i) => i.includes("件名")));
check("テンプレ: 企業名は含むので指摘なし", !withTmpl.issues.some((i) => i.includes("相手企業名")));
check("テンプレ: この本文なら指摘0件", withTmpl.issues.length === 0);

const withoutTmpl = validateEmail(longBody, shortSubject, analysis, { fromTemplate: false });
check("自由生成: 同じ本文で文字数/フック/商談/件名が指摘される",
  withoutTmpl.issues.some((i) => i.includes("文字数")) &&
  withoutTmpl.issues.some((i) => i.includes("フック")) &&
  withoutTmpl.issues.some((i) => i.includes("商談") || i.includes("打ち合わせ")) &&
  withoutTmpl.issues.some((i) => i.includes("件名")));

check("テンプレでも未解決変数は指摘する",
  validateEmail(longBody + "\n{{booking_url}}", shortSubject, analysis, { fromTemplate: true })
    .issues.some((i) => i.includes("未解決の変数")));

// ---------- Part 2: compose がテンプレ固定文を保持 + 変数置換 + AIゾーン生成 ----------
const MOCK_TEXT = "貴社の新店舗の取り組みに感銘を受けました。";
const server = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "m", type: "message", role: "assistant", model: "t",
      content: [{ type: "text", text: MOCK_TEXT }],
      stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.ANTHROPIC_API_KEY = "sk-ant-dummy";

const { composeBody } = await import("@/lib/compose");

const FIXED_OPEN = "突然のご連絡失礼します。これは絶対に変わってはいけない固定文です。";
const FIXED_CLOSE = "ご検討のほどよろしくお願いいたします。";
const BODY =
  `{{company_name}}\n{{person_name}}様\n\n${FIXED_OPEN}\n{{AI:この会社向けの一文}}\n\n${FIXED_CLOSE}`;

const composed = await composeBody({
  mode: "fixed_only", fixedPart: "", aiBrief: "", body: BODY,
  variables: { company_name: "テスト商店", person_name: "山田" },
  service: null, persona: null, companyName: "テスト商店", analysis: null,
} as never);

check("固定文(冒頭)が一字一句保持される", composed.body.includes(FIXED_OPEN));
check("固定文(締め)が一字一句保持される", composed.body.includes(FIXED_CLOSE));
check("{{company_name}}が実値に置換", composed.body.includes("テスト商店") && !composed.body.includes("{{company_name}}"));
check("{{person_name}}が実値に置換", composed.body.includes("山田様") && !composed.body.includes("{{person_name}}"));
check("{{AI:}}ゾーンが生成文に置換", composed.body.includes(MOCK_TEXT) && !composed.body.includes("{{AI:"));

await new Promise<void>((r) => server.close(() => r()));
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
