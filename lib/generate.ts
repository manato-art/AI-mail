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

export interface GenerateOptions {
  tone?: string;
  length?: string;
  cta?: string;
  additionalInstructions?: string;
  templateSubject?: string;
  templateBody?: string;
}

const TONE_MAP: Record<string, string> = {
  formal: "最も丁寧で格式高い文体。「〜でございます」「〜賜りますようお願い申し上げます」等を使い、堅実で信頼感のある印象を与える。",
  balanced: "ビジネスメールとして標準的な丁寧さ。「〜いたします」「〜させていただきます」等を基調に、硬すぎず軽すぎないバランス。",
  friendly: "丁寧さを保ちつつも親しみやすい文体。「〜ですね」「〜と思います」等を混ぜ、距離感を縮めるカジュアルな敬語を使う。",
};

const LENGTH_MAP: Record<string, string> = {
  short: "本文200字前後。要点を絞り、簡潔に伝える。150〜250字の範囲内に収める。",
  standard: "本文300字前後。バランスよく情報を盛り込む。250〜400字の範囲内に収める。",
  long: "本文450字前後。詳しい提案理由や導入効果まで丁寧に書く。400〜550字の範囲内に収める。",
};

const CTA_MAP: Record<string, string> = {
  online_meeting: "「15〜30分のオンラインでのご説明」等、気軽なオンライン商談を提案。日時候補の打診を含める。",
  phone: "「お電話で10分ほどご説明」等、電話での簡単な説明を提案。都合の良い時間帯を聞く。",
  send_materials: "「詳しい資料をお送り」等、まずは資料送付を提案。返信だけで済む軽いアクションにする。",
  seminar: "「近日開催の無料セミナーへのご招待」等、セミナーやウェビナーへの参加を提案。日程と参加方法を簡潔に案内。",
};

const FORM_ONLY_INSTRUCTIONS = `【フォーム用文面】
メールアドレスが見つからなかったため、問い合わせフォーム用の文面を作成してください:
- 宛名行なし（いきなり挨拶+名乗りから）
- 署名ブロックは簡略版（「{会社名} {名前}」程度）
- 件名は「お問い合わせ件名」欄に貼る想定`;

function buildSystemPrompt(isFormOnly: boolean, options?: GenerateOptions): string {
  const formOnlySection = isFormOnly ? `\n\n${FORM_ONLY_INSTRUCTIONS}` : "";

  const toneInstruction = TONE_MAP[options?.tone ?? ""] ?? TONE_MAP.balanced;
  const lengthInstruction = LENGTH_MAP[options?.length ?? ""] ?? LENGTH_MAP.standard;
  const ctaInstruction = CTA_MAP[options?.cta ?? ""] ?? CTA_MAP.online_meeting;

  const additionalSection = options?.additionalInstructions
    ? `\n\n【追加の指示（最優先で従うこと）】\n${options.additionalInstructions}`
    : "";

  const templateSection = options?.templateSubject && options?.templateBody
    ? `\n\n【テンプレート準拠（最重要）】
以下のテンプレートの構成・言い回し・段落構成・トーンを踏襲してメールを作成してください。
テンプレートの内容をそのままコピーするのではなく、相手企業の分析結果に合わせて具体的な内容を差し替えつつ、テンプレートの「型」に沿ってください。

--- テンプレート件名 ---
${options.templateSubject}

--- テンプレート本文 ---
${options.templateBody}
--- テンプレートここまで ---`
    : "";

  return `あなたは営業メール作成AIです。指定された人格として、分析結果に基づいた営業メールを作成します。

【絶対ルール — 人格設定より常に優先】

1. 宛名: 分析結果にrepresentative_nameがあれば「{会社名} {役職} {名前}様」、なければ「{会社名} ご担当者様」。(株)等の略記禁止、正式社名を使用。
2. 初回挨拶: 「突然のご連絡失礼いたします」等、初見への非礼を詫びる定型を必ず入れる。
3. 名乗り: 冒頭で会社名・氏名を名乗る。
4. 敬語: 尊敬語・謙譲語を正しく使い分ける。二重敬語禁止（「拝見させていただきました」→「拝見しました」）。
5. 締め: 「ご検討のほどよろしくお願いいたします」等の結び + 署名ブロック。
6. 禁止: 絵文字、顔文字、過度な「！」（本文全体で最大1個）、機種依存文字、全角英数字の混在。
7. 相手固有のフック: 分析結果のhookを必ず本文に反映する。「貴社のような企業様へ」等の汎用表現は禁止。
8. 分析結果に無い固有名詞・数値を本文に書かない（ハルシネーション禁止）。

【トーン】
${toneInstruction}

【文章量】
${lengthInstruction}

【行動喚起（CTA）】
${ctaInstruction}

【本文構成の型】
宛名 → 挨拶+名乗り（1-2文） → 連絡のきっかけ=相手固有のフック（HPで◯◯を拝見し…） → 提案の要点（相手の文脈×自社の強み、1-3文） → CTA → 結びの挨拶 → 署名

【件名ルール】
- 20〜35文字目安
- 「〜のご提案」「〜の件」等の慣例形
- 相手社名 or 相手事業への言及を含めて開封率を上げる
- 釣りタイトル・記号乱用（【】連打、！等）禁止${formOnlySection}${templateSection}${additionalSection}

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
representative_name（代表者名）: ${analysis.representative_name || "記載なし"}
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
  isFormOnly: boolean = false,
  options?: GenerateOptions
): Promise<GenerationResult> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(isFormOnly, options),
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
