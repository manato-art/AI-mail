import Anthropic from "@anthropic-ai/sdk";
import { resolveVariables, type VariableValues } from "@/lib/variables";
import type { ComposeMode, Persona, Service } from "@/lib/types";

/**
 * F4 ハイブリッド文面。
 *
 * fixed_part は「ユーザーが書いた、そのまま使ってほしい文章」なので、
 * 変数の解決以外で1文字でも変わってはいけない。AIに全文を書かせると
 * 必ず言い回しを直してくるため、AIには続きだけを書かせて機械的に連結する。
 */

const client = new Anthropic();
const MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-6";
const MAX_CONTINUATION_TOKENS = 1024;

const COMPOSE_MODES: ComposeMode[] = ["full_ai", "hybrid", "fixed_only"];

/** 不正な値が入ると生成経路の分岐が壊れるので、既知の値以外は既定に倒す */
export function normalizeComposeMode(value: unknown): ComposeMode {
  return COMPOSE_MODES.includes(value as ComposeMode) ? (value as ComposeMode) : "fixed_only";
}

export interface ComposeResult {
  body: string;
  /** hybrid でAIが書いた続き部分（検証・表示用） */
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
}

function buildSystemPrompt(persona?: Persona | null): string {
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

function buildUserPrompt(params: ComposeParams, resolvedFixed: string): string {
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
    max_tokens: MAX_CONTINUATION_TOKENS,
    system: buildSystemPrompt(params.persona),
    messages: [{ role: "user", content: buildUserPrompt(params, resolvedFixed) }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AIの応答を取得できませんでした");
  }
  return block.text.trim();
}

/**
 * モードに応じて本文を組み立てる。
 * hybrid では fixed_part を解決したものをそのまま先頭に置き、続きを連結する。
 */
export async function composeBody(params: ComposeParams): Promise<ComposeResult> {
  if (params.mode !== "hybrid") {
    return { body: resolveVariables(params.body, params.variables).text, continuation: "" };
  }

  const resolvedFixed = resolveVariables(params.fixedPart, params.variables).text;
  const continuation = await generateContinuation(params, resolvedFixed);

  return {
    body: `${resolvedFixed.trimEnd()}\n\n${continuation}`,
    continuation,
  };
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
