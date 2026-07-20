import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, CrawlResult, Service } from "@/lib/types";
import { fenceUntrusted } from "@/lib/prompt-fence";

const client = new Anthropic();

const MODEL = process.env.ANALYSIS_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `あなたは営業支援AIです。企業のWebサイト情報を分析し、構造化されたJSONで結果を返します。

分析の目的:
- 対象企業がどのような会社かを深く理解する
- その企業が大切にしている価値観・理念・創業の想いを把握する
- 自社サービスとの相性を判断する
- 営業メールで触れるべきポイントを抽出する（表面的な事業内容だけでなく、企業の根底にある想いに触れられるレベルで）

相性判断の基準:
- high: 自社サービスのターゲットに合致し、具体的な提案ポイントが見つかる
- medium: ある程度関連性があるが、直接的なフィットは限定的
- low: ターゲット外、または提案の接点が見つからない

出力は必ず以下のJSON形式のみで返してください。それ以外のテキストは含めないでください:
{
  "company_name": "正式な会社名",
  "representative_name": "代表者・担当者の役職と氏名（サイトに実名の記載がある場合のみ。例「代表取締役 山田太郎」。記載が無ければnull）",
  "business_summary": "何の会社か（1-2文）",
  "activities": ["主な事業・サービス"],
  "recent_topics": ["直近のニュース・動き（あれば）"],
  "philosophy": "会社理念・ミッション・ビジョン・創業の想い・大切にしている価値観（HPに記載があれば具体的に抜き出す。代表メッセージ・About・企業理念ページなどから。「ゼロから作り出す」「社会を変える」「お客様第一」等、その企業の根底にある信念。無ければnull）",
  "atmosphere": "社風・雰囲気・働き方のこだわり（HPの写真やテキストから読み取れる場合。無ければnull）",
  "approach_strategy": "この企業に対する提案アプローチ戦略。企業の理念や想いに共感を示しつつ、自社サービスとの接点を結びつけた切り出し方。「貴社が○○を大切にされている点に共感し、その実現をサポートできる」という論理で。2-3文。",
  "compatibility": {
    "score": "high | medium | low",
    "reason": "相性の理由"
  },
  "proposal_points": ["提案ポイント（2-3個）"],
  "hook": "メール冒頭で触れるべき相手固有の話題（1つ。HPに実際に書いてあることのみ）"
}`;

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

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseAnalysisResponse(rawText: string): AnalysisResult {
  try {
    return JSON.parse(rawText) as AnalysisResult;
  } catch {
    const extracted = extractJsonFromText(rawText);
    try {
      return JSON.parse(extracted) as AnalysisResult;
    } catch {
      throw new Error("AI応答のJSONパースに失敗しました");
    }
  }
}

export async function analyzeCompany(
  crawlResult: CrawlResult,
  service: Service
): Promise<AnalysisResult> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(crawlResult, service),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI応答からテキストを取得できませんでした");
  }

  return parseAnalysisResponse(textBlock.text);
}
