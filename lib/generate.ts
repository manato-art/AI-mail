import Anthropic from "@anthropic-ai/sdk";
import type {
  AnalysisResult,
  GenerationResult,
  Persona,
  Service,
} from "@/lib/types";
import { buildPersonaPrompt } from "@/lib/persona-prompt";

const client = new Anthropic();

const MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-6";

const FORM_ONLY_INSTRUCTIONS = `【フォーム用文面】
メールアドレスが見つからなかったため、問い合わせフォーム用の文面を作成してください:
- 宛名行なし（いきなり挨拶+名乗りから）
- 署名ブロックは簡略版（「{会社名} {名前}」程度）
- 件名は「お問い合わせ件名」欄に貼る想定`;

function buildSystemPrompt(isFormOnly: boolean): string {
  const formOnlySection = isFormOnly ? `\n\n${FORM_ONLY_INSTRUCTIONS}` : "";

  return `あなたは営業メール作成AIです。指定された人格として、分析結果に基づいた営業メールを作成します。

【絶対ルール — 人格設定より常に優先】

1. 宛名: 分析結果にrepresentative_nameがあれば「{会社名} {役職} {名前}様」、なければ「{会社名} ご担当者様」。(株)等の略記禁止、正式社名を使用。
2. 初回挨拶: 「突然のご連絡失礼いたします」等、初見への非礼を詫びる定型を必ず入れる。
3. 名乗り: 冒頭で会社名・氏名を名乗る。
4. 敬語: 尊敬語・謙譲語を正しく使い分ける。二重敬語禁止（「拝見させていただきました」→「拝見しました」）。
5. 締め: 「ご検討のほどよろしくお願いいたします」等の結び + 署名ブロック。
6. 禁止: 絵文字、顔文字、過度な「！」（本文全体で最大1個）、機種依存文字、全角英数字の混在。
7. 相手固有のフック: 分析結果のhookを必ず本文に反映する。「貴社のような企業様へ」等の汎用表現は禁止。
8. 300文字前後: 文章量指示に従うが、200〜450字の範囲内に収める。
9. 商談依頼で締める: 「15〜30分のオンラインでのご説明」等、具体的で軽いネクストアクション + 候補の打診。
10. 分析結果に無い固有名詞・数値を本文に書かない（ハルシネーション禁止）。

【本文構成の型】
宛名 → 挨拶+名乗り（1-2文） → 連絡のきっかけ=相手固有のフック（HPで◯◯を拝見し…） → 提案の要点（相手の文脈×自社の強み、1-3文） → 商談依頼（15-30分・オンライン可・候補打診） → 結びの挨拶 → 署名

【件名ルール】
- 20〜35文字目安
- 「〜のご提案」「〜の件」等の慣例形
- 相手社名 or 相手事業への言及を含めて開封率を上げる
- 釣りタイトル・記号乱用（【】連打、！等）禁止${formOnlySection}

出力は必ず以下のJSON形式のみで返してください:
{"subject": "件名", "body": "本文（署名含む）"}`;
}

function buildUserPrompt(
  analysis: AnalysisResult,
  service: Service,
  persona: Persona
): string {
  const personaPrompt = buildPersonaPrompt(persona);
  const signatureBlock =
    persona.signature_block ||
    `${persona.company_name}\n${persona.title}　${persona.name}`;

  return `以下の情報に基づいて営業メールを作成してください。

${personaPrompt}

【自社サービス情報】
サービス名: ${service.name}
説明: ${service.description}
強み: ${service.strengths}
ターゲット: ${service.target}
${service.lp_url ? `LP URL: ${service.lp_url}` : ""}
${service.pdf_extracted_text ? `提案資料の要約: ${service.pdf_extracted_text.slice(0, 2000)}` : ""}

【相手企業の分析結果】
会社名: ${analysis.company_name}
事業概要: ${analysis.business_summary}
主な事業: ${analysis.activities.join("、")}
直近の動き: ${analysis.recent_topics.join("、") || "なし"}
相性: ${analysis.compatibility.score}（${analysis.compatibility.reason}）
提案ポイント: ${analysis.proposal_points.join("、")}
フック: ${analysis.hook}

【署名ブロック】
${signatureBlock}

JSONで出力してください。`;
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

function parseGenerationResponse(rawText: string): GenerationResult {
  try {
    return JSON.parse(rawText) as GenerationResult;
  } catch {
    const extracted = extractJsonFromText(rawText);
    try {
      return JSON.parse(extracted) as GenerationResult;
    } catch {
      throw new Error("AI応答のJSONパースに失敗しました");
    }
  }
}

export async function generateEmail(
  analysis: AnalysisResult,
  service: Service,
  persona: Persona,
  isFormOnly: boolean = false
): Promise<GenerationResult> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(isFormOnly),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(analysis, service, persona),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI応答からテキストを取得できませんでした");
  }

  return parseGenerationResponse(textBlock.text);
}
