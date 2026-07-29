/**
 * メール生成の失敗が「原因の分かる文」で返ることを検証する。
 *
 * 2026-07-29: 本番で全社が `サーバーエラーが発生しました` になり、
 * 画面にもレスポンスにも原因の手掛かりが一切残らなかった。
 * 分類漏れ（401/403/404/400 等の AI API エラー・DB例外）を汎用文に潰さないことを守る。
 */
import { APIError } from "@anthropic-ai/sdk";
import { classifyGenerateError } from "@/lib/generate-error";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, got?: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}${cond ? "" : `\n   → got: ${got}`}`);
  cond ? pass++ : fail++;
};

const apiError = (status: number, type: string, message: string) =>
  APIError.generate(status, { type: "error", error: { type, message } }, undefined, new Headers());

// --- AI API の HTTP エラーは種類ごとに何を直すか分かる文にする ---
{
  const r = classifyGenerateError(apiError(401, "authentication_error", "invalid x-api-key"));
  check("401はキーの認証エラーと分かる", r.message.includes("ANTHROPIC_API_KEY") && !r.retryable, r.message);
}
{
  const r = classifyGenerateError(apiError(404, "not_found_error", "model: claude-sonnet-4-6"));
  check("404はモデル名の問題と分かる",
    r.message.includes("モデル") && r.message.includes("claude-sonnet-4-6") && !r.retryable, r.message);
}
{
  const r = classifyGenerateError(apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API"));
  check("残高不足は請求の問題と分かる", r.message.includes("残高") && !r.retryable, r.message);
}
{
  const r = classifyGenerateError(apiError(403, "permission_error", "not allowed"));
  check("403は権限エラーと分かる", r.message.includes("権限") && !r.retryable, r.message);
}
{
  const r = classifyGenerateError(apiError(429, "rate_limit_error", "slow down"));
  check("429は制限＋再試行可", r.message.includes("利用制限") && r.retryable && r.status === 429, r.message);
}
{
  const r = classifyGenerateError(apiError(529, "overloaded_error", "overloaded"));
  check("5xxは一時的＋再試行可", r.retryable && r.message.includes("一時的"), r.message);
}
{
  const r = classifyGenerateError(apiError(418, "weird_error", "teapot"));
  check("未知のstatusでも status と種別を残す",
    r.message.includes("418") && r.message.includes("weird_error"), r.message);
}

// --- 分類外の例外も握りつぶさない（段階＋例外の中身を残す） ---
{
  const dbErr = Object.assign(new Error("SQLITE_FULL: database or disk is full"), { name: "SqliteError" });
  const r = classifyGenerateError(dbErr, "保存");
  check("DB例外は段階と原文を残す",
    r.message.includes("保存") && r.message.includes("SQLITE_FULL"), r.message);
}
{
  const r = classifyGenerateError(new TypeError("Cannot read properties of undefined (reading 'body')"), "生成");
  check("想定外の例外も汎用文で潰さない",
    r.message.includes("生成") && r.message.includes("reading 'body'"), r.message);
}
{
  // undici の "fetch failed" は接続断。再試行可として扱う
  const r = classifyGenerateError(new TypeError("fetch failed"), "生成");
  check("fetch failed は接続エラーとして再試行可", r.retryable && r.message.includes("接続"), r.message);
}

// --- 2026-07-29 の本丸: SDKが二重ロードされ instanceof が効かない状況でも分類できること ---
{
  // 別コピーの SDK が投げた 429（クラス一致はしないが status は持つ）を模す
  const foreign = Object.assign(new Error("429 rate limited"), {
    status: 429,
    error: { type: "error", error: { type: "rate_limit_error", message: "rate limited" } },
  });
  const r = classifyGenerateError(foreign, "生成");
  check("instanceofが効かなくても429を制限として扱う",
    r.message.includes("利用制限") && r.retryable && r.status === 429, r.message);
}
{
  const foreign = Object.assign(new Error("401"), {
    status: 401,
    error: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
  });
  const r = classifyGenerateError(foreign, "生成");
  check("instanceofが効かなくても401をキーの問題として扱う", r.message.includes("ANTHROPIC_API_KEY"), r.message);
}
{
  const r = classifyGenerateError(Object.assign(new Error("Connection error."), { name: "APIConnectionError" }), "生成");
  check("接続エラーは名前でも拾える", r.message.includes("接続に失敗") && r.retryable, r.message);
}
{
  const r = classifyGenerateError("何かの文字列", "分析");
  check("Error以外が投げられても手掛かりを残す", r.message.includes("何かの文字列"), r.message);
}
{
  const r = classifyGenerateError(new Error("boom sk-ant-api03-SECRETSECRETSECRET"), "生成");
  check("例外に混ざったAPIキーは伏せる",
    !r.message.includes("SECRETSECRET") && r.message.includes("sk-***"), r.message);
}

// --- 既存の分類（Gemini 側・パース失敗）は従来通りの文言を維持 ---
{
  const r = classifyGenerateError(new Error("分析APIエラー: 503 Service Unavailable"));
  check("分析APIエラーは従来通り再試行可", r.retryable && r.message.includes("分析APIエラー"), r.message);
}
{
  const r = classifyGenerateError(new Error("AI応答のJSONパースに失敗しました（生成: 応答切れ）"));
  check("パース失敗は従来通りの案内", r.message.includes("解析できませんでした") && r.retryable, r.message);
}
{
  const r = classifyGenerateError(new Error("GEMINI_API_KEY が設定されていません"));
  check("キー未設定はそのまま伝える", r.message.includes("GEMINI_API_KEY") && !r.retryable, r.message);
}

// --- 退行防止: 中身の無い汎用文を返さない ---
{
  const samples = [
    classifyGenerateError(new Error("なにか未知の失敗"), "生成"),
    classifyGenerateError(apiError(401, "authentication_error", "x")),
    classifyGenerateError(new TypeError("fetch failed"), "サイト読み取り"),
  ];
  check("『サーバーエラーが発生しました』だけで返さない",
    samples.every((r) => r.message !== "サーバーエラーが発生しました"));
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILED"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
