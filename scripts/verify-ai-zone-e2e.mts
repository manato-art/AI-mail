/**
 * ②AIブロックのE2E検証: ローカルにAnthropic互換のモックサーバを立て、
 * ANTHROPIC_BASE_URL で差し向けて本物の composeBody を通す。
 * SDK→HTTP→レスポンス解析→AIゾーン置換 の全経路を実際に動かす。
 */
import http from "node:http";
import { AddressInfo } from "node:net";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// Anthropic /v1/messages を模したモックサーバ。送られたプロンプトを捕捉する。
let capturedPrompt = "";
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try { capturedPrompt = JSON.stringify(JSON.parse(body).messages); } catch { /* noop */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: "test",
      content: [{ type: "text", text: "貴社の地域密着の姿勢に深く共感しております。" }],
      stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;

// SDKはコンストラクタでbaseURLを読むので、compose を import する前に設定する
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.ANTHROPIC_API_KEY = "sk-ant-dummy";

const { composeBody } = await import("@/lib/compose");
const { resolveEmailVariables } = await import("@/lib/variables");

const BODY = "{{person_name}}様\n\n突然のご連絡失礼します。\n{{AI:}}\n\nぜひ一度お話しできれば幸いです。";

const composed = await composeBody({
  mode: "fixed_only", fixedPart: "", aiBrief: "", body: BODY,
  variables: {}, service: null, persona: null,
  companyName: "まるや商店", analysis: null,
});

check("AIゾーンが生成テキストに置換された", composed.body.includes("深く共感しております") && !composed.body.includes("{{AI:}}"));
check("固定文はそのまま残る", composed.body.includes("突然のご連絡失礼します") && composed.body.includes("ぜひ一度お話しできれば"));
check("差し込み変数は生成時には残る", composed.body.includes("{{person_name}}"));
check("プロンプトに『全体になじむ』デフォルト指示が入る", capturedPrompt.includes("メール全体の流れに自然になじむ"));
check("プロンプトに周囲の本文（文脈）が入る", capturedPrompt.includes("突然のご連絡失礼します") && capturedPrompt.includes("ここに挿入する文章"));
check("プロンプトに企業名が入る", capturedPrompt.includes("まるや商店"));

const sent = resolveEmailVariables("{{company_name}}様へ", composed.body, {
  company_name: "まるや商店", person_name: "採用ご担当者",
});
check("送信時に{{person_name}}が解決される", sent.body.includes("採用ご担当者様") && !sent.body.includes("{{person_name}}"));
check("生成されたAI文も最終本文に残っている", sent.body.includes("深く共感しております"));

await new Promise<void>((r) => server.close(() => r()));
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
