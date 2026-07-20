import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AnalysisResult, CrawlResult, Service } from "@/lib/types";
import { fenceUntrusted } from "@/lib/prompt-fence";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.ANALYSIS_MODEL || "gemini-2.5-flash";

/**
 * プロンプトに載せる「出力してほしいJSONのお手本」。
 *
 * テンプレート文字列に手書きしないこと。手書きすると、説明文の中に
 * エスケープされていない " が紛れ込んでもTypeScriptは通ってしまい、
 * 「壊れたJSONのお手本」をモデルに見せることになる。モデルはそれを模倣し、
 * 実行時にパース失敗として現れる（実際に impressive_quote で発生した）。
 * ここをオブジェクトで持ち JSON.stringify する限り、出力は常に有効なJSONになる。
 */
const OUTPUT_EXAMPLE = {
  company_name: "正式な会社名",
  representative_name:
    "代表者・担当者の役職と氏名（サイトに実名の記載がある場合のみ。例「代表取締役 山田太郎」。記載が無ければnull）",
  business_summary: "何の会社か（1-2文）",
  activities: ["主な事業・サービス"],
  recent_topics: ["直近のニュース・動き（あれば）"],
  philosophy:
    "会社理念・ミッション・ビジョン・創業の想い・大切にしている価値観（HPに記載があれば具体的に抜き出す。代表メッセージ・About・企業理念ページなどから。無ければnull）",
  atmosphere:
    "社風・雰囲気・働き方のこだわり（HPの写真やテキストから読み取れる場合。無ければnull）",
  impressive_quote:
    "HPの中で最も印象的だった一文や表現をそのまま引用（代表メッセージ・理念・サービス説明等から。メールで「貴社の『○○』という言葉に」と引用できるレベルの具体的な一文。無ければnull）",
  likely_challenges:
    "この企業が事業を伸ばす上で直面しているであろう課題（事業内容・業界・規模から推測。1-2個。推測であることを自覚した上で書く）",
  empathy_point:
    "この企業の活動で共感・尊敬できる具体的なポイント（汎用的な褒め言葉ではなく、HPを読んだ人だけが書ける具体性で）",
  approach_strategy:
    "この企業に対する自然な提案の橋渡し。相手の事業内容や課題から、自社サービスのどの強みがどの場面で活きるかを具体的に1-2文で。",
  compatibility: {
    score: "high | medium | low",
    reason: "相性の理由",
  },
  proposal_points: [
    "この企業の具体的な状況に合わせた提案（2-3個。一般論ではなくこの企業の文脈に落とし込む）",
  ],
  hook: "メール冒頭で触れるべき相手固有の話題（1つ。HPに実際に書いてあることのみ）",
} as const;

const SYSTEM_INSTRUCTION = `あなたは営業支援AIです。企業のWebサイト情報を分析し、構造化されたJSONで結果を返します。

分析の目的:
- 対象企業がどのような会社かを深く理解する
- その企業が大切にしている価値観・理念・創業の想いを把握する
- 自社サービスとの相性を判断する
- 営業メールで触れるべきポイントを抽出する（表面的な事業内容だけでなく、企業の根底にある想いに触れられるレベルで）

相性判断の基準:
- high: 自社サービスのターゲットに合致し、具体的な提案ポイントが見つかる
- medium: ある程度関連性があるが、直接的なフィットは限定的
- low: ターゲット外、または提案の接点が見つからない

出力は必ず以下のJSON形式で返してください:
${JSON.stringify(OUTPUT_EXAMPLE, null, 2)}`;

function buildUserPrompt(crawlResult: CrawlResult, service: Service): string {
  const pagesText = crawlResult.pages
    .map((page) => `[ページ: ${page.url}]\n${page.text}`)
    .join("\n\n");

  return `以下は分析対象の企業Webサイトから取得したテキストです。

${fenceUntrusted("分析対象データ", pagesText)}

以下は自社サービスの情報です:
サービス名: ${service.name}
サービス説明: ${service.description}
強み: ${service.strengths}
ターゲット: ${service.target}

上記の企業情報を分析し、JSONで結果を返してください。
hookは必ずWebサイトに実際に記載されている内容に基づいてください。サイトに書かれていない事実を作らないでください。
representative_nameはサイトに実際に記載されている氏名のみ。推測・創作は禁止。記載が無ければnullにしてください。`;
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

function parseAnalysisResponse(rawText: string, finishReason?: string): AnalysisResult {
  const text = stripMarkdownFence(rawText);

  try {
    return JSON.parse(text) as AnalysisResult;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as AnalysisResult;
      } catch { /* fall through */ }
    }

    const isTruncated = finishReason === "MAX_TOKENS";
    console.error("[analyze] JSON parse failed.", {
      length: text.length,
      finishReason,
      first80: text.slice(0, 80),
      last200: text.slice(-200),
    });
    throw new Error(
      isTruncated
        ? "AI応答のJSONパースに失敗しました（分析）（応答切れ）"
        : `AI応答のJSONパースに失敗しました（分析）（${text.length}文字, finish=${finishReason ?? "?"}）`
    );
  }
}

const MAX_RETRIES = 1;

async function callAnalysisApi(
  crawlResult: CrawlResult,
  service: Service
): Promise<AnalysisResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });

  let result;
  try {
    result = await model.generateContent(buildUserPrompt(crawlResult, service));
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    console.error("[analyze] Gemini API error:", msg);
    throw new Error(`分析APIエラー: ${msg.slice(0, 200)}`);
  }

  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason === "SAFETY") {
    const cats = candidate?.safetyRatings
      ?.filter((r) => r.probability !== "NEGLIGIBLE")
      .map((r) => r.category.replace("HARM_CATEGORY_", ""))
      .join(", ");
    throw new Error(`分析がブロックされました（安全性フィルタ: ${cats || "unknown"}）`);
  }

  let text: string;
  try {
    text = result.response.text();
  } catch (respErr) {
    const reason = result.response.promptFeedback?.blockReason
      ?? finishReason
      ?? "unknown";
    console.error("[analyze] Gemini response blocked:", reason, {
      promptFeedback: result.response.promptFeedback,
      finishReason,
    });
    throw new Error(`分析がブロックされました（理由: ${reason}）`);
  }

  if (!text || !text.trim()) {
    throw new Error(`分析APIエラー: 空の応答（finishReason: ${finishReason ?? "unknown"}）`);
  }

  if (finishReason === "MAX_TOKENS") {
    console.warn("[analyze] Response truncated (MAX_TOKENS). Length:", text.length);
  }

  return parseAnalysisResponse(text, finishReason ?? undefined);
}

export async function analyzeCompany(
  crawlResult: CrawlResult,
  service: Service
): Promise<AnalysisResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callAnalysisApi(crawlResult, service);
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      console.error(`[analyze] attempt ${attempt + 1} failed, retrying...`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("AI応答のJSONパースに失敗しました（分析）");
}
