import Anthropic from "@anthropic-ai/sdk";
import { resolveVariables, type VariableValues } from "@/lib/variables";
import { fenceUntrusted } from "@/lib/prompt-fence";
import type { AnalysisResult, ComposeMode, Persona, Service } from "@/lib/types";

/**
 * F4 ハイブリッド文面 + {{AI:指示文}} ゾーン。
 *
 * テンプレ本文に `{{AI:ここに指示}}` マーカーを埋め込むと、
 * その部分を企業分析データに基づいてAIが生成する。
 * マーカーは本文中のどこにでも何個でも置ける。
 * 固定テキストと差し込み変数はそのまま残る。
 */

const client = new Anthropic();
const MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-6";
const MAX_ZONE_TOKENS = 512;

const COMPOSE_MODES: ComposeMode[] = ["full_ai", "hybrid", "fixed_only"];

/** AI ゾーンのパターン。{{AI:...}} を検出する。改行を含む指示にも対応 */
const AI_ZONE_PATTERN = /\{\{AI:([\s\S]*?)\}\}/g;

/** 不正な値が入ると生成経路の分岐が壊れるので、既知の値以外は既定に倒す */
export function normalizeComposeMode(value: unknown): ComposeMode {
  return COMPOSE_MODES.includes(value as ComposeMode) ? (value as ComposeMode) : "fixed_only";
}

export interface ComposeResult {
  body: string;
  /** hybrid でAIが書いた続き部分（検証・表示用）— AI zone の場合は空 */
  continuation: string;
}

export interface ComposeParams {
  mode: ComposeMode;
  fixedPart: string;
  aiBrief: string;
  /** fixed_only / full_ai で使う本文 */
  body: string;
  variables: VariableValues;
  service?: Service | null;
  persona?: Persona | null;
  companyName?: string;
  /** 企業のAI分析結果。{{AI:...}} ゾーンの生成に使う */
  analysis?: AnalysisResult | null;
}

/** テンプレ本文に {{AI:...}} ゾーンが含まれるか判定する */
export function hasAiZones(text: string): boolean {
  AI_ZONE_PATTERN.lastIndex = 0;
  return AI_ZONE_PATTERN.test(text);
}

/** テンプレ本文から {{AI:...}} ゾーンの指示を全て抽出する */
export function extractAiZones(text: string): Array<{ full: string; instruction: string }> {
  const zones: Array<{ full: string; instruction: string }> = [];
  for (const match of text.matchAll(AI_ZONE_PATTERN)) {
    zones.push({ full: match[0], instruction: match[1].trim() });
  }
  return zones;
}

function buildZoneSystemPrompt(persona?: Persona | null): string {
  return `あなたは営業メールの一部を書くアシスタントです。

【最重要】
- 指示に従って、メール本文に挿入する文章**だけ**を出力してください
- 挨拶・署名・前置き・説明は一切含めないでください（それらはテンプレートの別の部分にあります）
- 出力はそのまま差し込まれるため、「以下は…」のような導入文は不要です

【守るルール】
- 敬語は正しく。二重敬語禁止（「拝見させていただきました」→「拝見しました」）
- 絵文字・顔文字・過度な「！」を使わない
- 与えられた情報に無い固有名詞・数値を書かない（事実の捏造を禁止）
- 相手企業について断定的な数値（創業N年・従業員N名等）を書かない
- 人格設定があれば、そのトーンに合わせてください

${persona ? `【人格設定】\n名前: ${persona.name}\n肩書: ${persona.title}\n論理性: ${persona.logic}/5\n情熱: ${persona.passion}/5\n丁寧さ: ${persona.politeness}/5\nセールス感: ${persona.salesiness}/5\n長さ: ${persona.length}/5` : ""}`;
}

function buildZoneUserPrompt(
  instruction: string,
  analysis: AnalysisResult | null | undefined,
  service: Service | null | undefined,
  companyName: string | undefined
): string {
  const parts: string[] = [];

  parts.push(`【生成指示】\n${instruction}`);

  if (analysis) {
    const analysisText = [
      `会社名: ${analysis.company_name}`,
      `事業概要: ${analysis.business_summary}`,
      analysis.activities?.length ? `主な事業: ${analysis.activities.join("、")}` : null,
      analysis.philosophy ? `理念: ${analysis.philosophy}` : null,
      analysis.atmosphere ? `社風: ${analysis.atmosphere}` : null,
      analysis.approach_strategy ? `アプローチ戦略: ${analysis.approach_strategy}` : null,
      analysis.recent_topics?.length ? `最近の動き: ${analysis.recent_topics.join("、")}` : null,
      analysis.compatibility ? `相性: ${analysis.compatibility.score}（${analysis.compatibility.reason}）` : null,
      analysis.proposal_points?.length ? `提案ポイント: ${analysis.proposal_points.join("、")}` : null,
      analysis.hook ? `フック: ${analysis.hook}` : null,
    ].filter(Boolean).join("\n");

    parts.push(`\n【相手企業の分析データ】\n${fenceUntrusted("企業分析", analysisText)}`);
  } else if (companyName) {
    parts.push(`\n【宛先の企業名】\n${companyName}`);
  }

  if (service) {
    parts.push(`\n【自社サービス】\nサービス名: ${service.name}\n説明: ${service.description}\n強み: ${service.strengths}`);
  }

  parts.push("\n指示に従って挿入する文章だけを出力してください。");

  return parts.join("\n");
}

async function generateZoneContent(
  instruction: string,
  params: ComposeParams
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_ZONE_TOKENS,
    system: buildZoneSystemPrompt(params.persona),
    messages: [{
      role: "user",
      content: buildZoneUserPrompt(instruction, params.analysis, params.service, params.companyName),
    }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AIの応答を取得できませんでした");
  }
  return block.text.trim();
}

/**
 * 本文中の全 {{AI:...}} ゾーンをAI生成テキストで置換する。
 * ゾーンごとに順次呼ぶ（並列だとレートリミットに当たりやすい）。
 */
async function resolveAiZones(text: string, params: ComposeParams): Promise<string> {
  const zones = extractAiZones(text);
  if (zones.length === 0) return text;

  let result = text;
  for (const zone of zones) {
    const generated = await generateZoneContent(zone.instruction, params);
    result = result.replace(zone.full, generated);
  }
  return result;
}

// --- 旧 hybrid モード（後方互換）---

function buildHybridSystemPrompt(persona?: Persona | null): string {
  const signature =
    persona?.signature_block || `${persona?.company_name ?? ""}\n${persona?.name ?? ""}`;

  return `あなたは営業メールの続きを書くアシスタントです。

【最重要】
- 与えられた「冒頭部分」は完成済みです。**書き直さず、繰り返さず、続きだけ**を書いてください
- 出力は続きの本文のみ。冒頭部分・前置き・説明・マークダウン記法は一切含めないでください

【守るルール】
- 敬語は正しく。二重敬語禁止（「拝見させていただきました」→「拝見しました」）
- 絵文字・顔文字・過度な「！」を使わない
- 与えられた情報に無い固有名詞・数値を書かない（事実の捏造を禁止）
- 相手企業について断定的な数値（創業N年・従業員N名等）を書かない
- 最後は結びの挨拶と、以下の署名で締める

【署名】
${signature}`;
}

function buildHybridUserPrompt(params: ComposeParams, resolvedFixed: string): string {
  const { aiBrief, service, companyName } = params;

  return `【冒頭部分（完成済み・書き直さないこと）】
${resolvedFixed}

【この後どう続けるかの指示】
${aiBrief}

【自社サービス】
${service ? `サービス名: ${service.name}\n説明: ${service.description}\n強み: ${service.strengths}` : "（未設定）"}

【宛先の企業名】
${companyName || "（未設定）"}

冒頭部分の続きだけを書いてください。`;
}

async function generateContinuation(params: ComposeParams, resolvedFixed: string): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildHybridSystemPrompt(params.persona),
    messages: [{ role: "user", content: buildHybridUserPrompt(params, resolvedFixed) }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AIの応答を取得できませんでした");
  }
  return block.text.trim();
}

/**
 * モードに応じて本文を組み立てる。
 *
 * 1. fixed_only: 変数を解決し、{{AI:...}} ゾーンがあればAI生成で置換
 * 2. hybrid: fixed_part を解決して先頭に置き、続きをAIが生成（旧互換）
 * 3. full_ai: 全文AI生成（既存のprospect生成経路で使用）
 */
export async function composeBody(params: ComposeParams): Promise<ComposeResult> {
  if (params.mode === "hybrid") {
    const resolvedFixed = resolveVariables(params.fixedPart, params.variables).text;
    const continuation = await generateContinuation(params, resolvedFixed);
    return {
      body: `${resolvedFixed.trimEnd()}\n\n${continuation}`,
      continuation,
    };
  }

  const resolved = resolveVariables(params.body, params.variables).text;

  if (hasAiZones(resolved)) {
    const body = await resolveAiZones(resolved, params);
    return { body, continuation: "" };
  }

  return { body: resolved, continuation: "" };
}

/**
 * hybrid の本文が fixed_part を改変していないかを検証する（仕様書F4の品質チェック）。
 * 送信直前に呼び、崩れていたら送らせない。
 */
export function verifyFixedPartIntact(
  body: string,
  fixedPart: string,
  variables: VariableValues
): boolean {
  const expected = resolveVariables(fixedPart, variables).text.trimEnd();
  if (!expected) return true;
  return body.trimStart().startsWith(expected);
}
