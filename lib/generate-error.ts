/**
 * メール生成の失敗を「何が起きたか分かる日本語」に変換する。
 *
 * 2026-07-29 の本番障害の教訓が2つ入っている:
 *
 * 1. **クラス判定（instanceof）に頼らない**
 *    AI SDK のエラークラスは、読み込み経路が違うと別物になる（ESM/CJS の二重ロード）。
 *    実測で「同じ 429 エラーが、呼び出し側では RateLimitError・別モジュールでは非該当」になった。
 *    こうなると全 AI エラーが分類から漏れ、汎用文だけが画面に残る。
 *    → **HTTP status という値**で判定する。値なら読み込み経路に左右されない。
 *
 * 2. **分類できない例外を握りつぶさない**
 *    以前は全部 `サーバーエラーが発生しました` に潰していたため、本番で全社が失敗しても
 *    原因の手掛かりがどこにも残らなかった。分からないものは「どの段階で・何が」を必ず添える。
 */
import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from "@anthropic-ai/sdk";

/** 失敗した段階。画面に出すのでユーザー語彙で書く */
export type GenerateStage = "準備" | "サイト読み取り" | "分析" | "生成" | "保存";

export interface ClassifiedError {
  message: string;
  status: number;
  /** 時間を置けば直る種類か（クライアントの自動リトライ判断に使う） */
  retryable: boolean;
  /**
   * アカウント・設定側の問題で、**どの会社でも同じように失敗する**種類か。
   * 残高切れ・キー無効・モデル名間違いなど。一括生成はこれが続いたら止める
   * （1社ごとにサイト読み取りとGemini分析＝有料処理を先に走らせてから落ちるため、
   *   気付かず流し続けると全社ぶんの調査費を捨てる）。
   */
  fatal?: boolean;
}

const MAX_DETAIL = 200;

/** 万一 APIキーが例外メッセージに混ざっても外へ出さない */
function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "AIza***");
}

/** 分類できない例外から、短い手掛かり（例外名＋先頭200字）を作る */
function detailOf(error: unknown): string {
  if (error instanceof Error) {
    const ctor = error.constructor?.name;
    const label = error.name && error.name !== "Error" ? error.name : ctor && ctor !== "Error" ? ctor : "";
    return redact(`${label ? `${label}: ` : ""}${error.message}`).slice(0, MAX_DETAIL);
  }
  if (typeof error === "string") return redact(error).slice(0, MAX_DETAIL);
  try {
    return redact(JSON.stringify(error)).slice(0, MAX_DETAIL);
  } catch {
    return "詳細不明の例外";
  }
}

/**
 * AI API の HTTP エラーの形をしているか（**クラスではなく値の形**で見る）。
 * SDK は status と、パース済みの error ボディを実体に持つ。
 */
function asApiErrorShape(error: unknown): { status: number; type: string; message: string } | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    status?: unknown;
    error?: { error?: { type?: unknown; message?: unknown } };
  };
  if (typeof candidate.status !== "number" || candidate.status < 100 || candidate.status > 599) return null;
  const body = candidate.error?.error;
  return {
    status: candidate.status,
    type: typeof body?.type === "string" ? body.type : "unknown_error",
    message: redact(typeof body?.message === "string" ? body.message : "").slice(0, MAX_DETAIL),
  };
}

/** 接続系（status を持たない）の判定。クラス一致が効かない環境でも名前で拾えるようにする */
function connectionKindOf(error: unknown): "timeout" | "connection" | null {
  if (error instanceof APIConnectionTimeoutError) return "timeout";
  if (error instanceof APIConnectionError) return "connection";
  if (!(error instanceof Error)) return null;
  const name = `${error.name} ${error.constructor?.name ?? ""}`;
  if (name.includes("APIConnectionTimeoutError")) return "timeout";
  if (name.includes("APIConnectionError")) return "connection";
  if (/timed out|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(error.message)) return "timeout";
  if (/Connection error|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(error.message)) return "connection";
  return null;
}

/**
 * status ごとに「運用者が次に何を直すか」が分かる文にする。
 * キー・残高・モデル名の3つは待っても直らないので retryable=false（無駄な再試行を止める）。
 */
function classifyByStatus(api: { status: number; type: string; message: string }): ClassifiedError {
  const { status, type, message } = api;

  if (status === 401) {
    return { message: "AI APIキーが認証されませんでした。ANTHROPIC_API_KEY を確認してください", status: 500, retryable: false, fatal: true };
  }
  if (status === 403) {
    return { message: `AI APIへのアクセスが拒否されました（権限エラー）${message ? `: ${message}` : ""}`, status: 500, retryable: false, fatal: true };
  }
  if (status === 404) {
    return { message: `AIモデルが見つかりません。GENERATION_MODEL の設定を確認してください（${message || type}）`, status: 500, retryable: false, fatal: true };
  }
  if (status === 400) {
    if (/credit balance|billing|quota/i.test(message)) {
      return { message: `AI APIの残高・請求設定に問題があります: ${message}`, status: 500, retryable: false, fatal: true };
    }
    return { message: `AI APIにリクエストを拒否されました: ${message || type}`, status: 500, retryable: false };
  }
  if (status === 413) {
    return { message: "送信した情報が大きすぎてAIが受け取れませんでした（対象サイトの本文量が多すぎます）", status: 500, retryable: false };
  }
  if (status === 429) {
    return { message: "AI APIの利用制限に達しました。しばらく待ってから再試行してください", status: 429, retryable: true };
  }
  if (status >= 500) {
    return { message: `AI APIが一時的に不安定です（${status}${type !== "unknown_error" ? ` ${type}` : ""}）。しばらく待ってから再試行してください`, status: 502, retryable: true };
  }
  return { message: `AI APIエラー（${status} ${type}）${message ? `: ${message}` : ""}`, status: 502, retryable: false };
}

export function classifyGenerateError(error: unknown, stage: GenerateStage = "生成"): ClassifiedError {
  // 1. 接続系は status を持たないので先に見る
  const connection = connectionKindOf(error);
  if (connection === "timeout") {
    return { message: "AI APIへの接続がタイムアウトしました。再試行してください", status: 504, retryable: true };
  }
  if (connection === "connection") {
    return { message: "AI APIへの接続に失敗しました。再試行してください", status: 502, retryable: true };
  }

  // 2. HTTP status を持つ AI API エラー（instanceof ではなく形で判定）
  const api = asApiErrorShape(error) ?? (error instanceof APIError && typeof error.status === "number"
    ? { status: error.status, type: "unknown_error", message: "" }
    : null);
  if (api) return classifyByStatus(api);

  if (error instanceof Error) {
    // 3. 設定不備（APIキー未設定・無効）はリトライしても直らない
    if (error.message.includes("が設定されていません")) {
      return { message: error.message, status: 500, retryable: false, fatal: true };
    }
    if (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID")) {
      return { message: "AI APIキーが無効です。GEMINI_API_KEY を確認してください", status: 500, retryable: false, fatal: true };
    }
    // 4. 分析（Gemini）側で包んだエラー
    if (error.message.includes("分析APIエラー") || error.message.includes("分析がブロック")) {
      return { message: error.message, status: 502, retryable: true };
    }
    if (error.message.includes("JSONパース")) {
      const parseStage = error.message.includes("分析") ? "分析" : error.message.includes("生成") ? "生成" : "";
      const detail = error.message.includes("応答切れ") ? "（応答が途中で切れました）" : "";
      return { message: `AIの応答を解析できませんでした${parseStage ? `（${parseStage}段階）` : ""}${detail}。再試行してください`, status: 502, retryable: true };
    }
    if (error.message.includes("テキストを取得できません")) {
      return { message: "AIから有効な応答がありませんでした。再試行してください", status: 502, retryable: true };
    }
  }

  // 5. ここに来たら想定外。**握りつぶさず**、段階と例外の中身を残す
  return { message: `メール作成に失敗しました（${stage}）: ${detailOf(error)}`, status: 500, retryable: false };
}
