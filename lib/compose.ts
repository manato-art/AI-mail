import Anthropic from "@anthropic-ai/sdk";
import { resolveVariables, type VariableValues } from "@/lib/variables";
import { parseBannedPhrases } from "@/lib/send-guard";
import { fenceUntrusted } from "@/lib/prompt-fence";
import type { AnalysisResult, ComposeMode, Persona, Service, Template } from "@/lib/types";

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

/** AI ゾーンの開始。終わりは正規表現では決められない（下の scanAiZones を参照） */
const AI_ZONE_OPEN = "{{AI:";

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

export interface AiZone {
  /** `{{AI:` から対応する `}}` までの全体 */
  full: string;
  /** 中身の指示文（前後の空白を除く） */
  instruction: string;
  /** text 内の開始位置 */
  index: number;
}

/**
 * {{AI:...}} ゾーンを、**波括弧の対応を数えながら**切り出す。
 *
 * ★ なぜ正規表現をやめたか（2026-08-06・実際に顧客宛の下書きが壊れた）:
 *   旧実装は `/\{\{AI:([\s\S]*?)\}\}/g` の**非貪欲**マッチだった。
 *   指示文の中に `{{company_name}}` のような変数を書くと、
 *   **その閉じ括弧でゾーンが終わったことになる**。結果:
 *     1. AIには途中で切れた指示しか渡らない（末尾の条件が丸ごと消える）
 *     2. 残りの `}}…そこへ自然に渡すこと。}}` が
 *        **社内向けの指示文のまま本文に残り、顧客に届く**
 *   実際、生成されたメールに指示文の断片がそのまま入っていた。
 *
 *   「指示文に変数を書くな」という運用ルールでは防げない。書けてしまうし、
 *   書くのが自然だから（次の段落の文言を指示に引用したくなる）。**構文の側を直す。**
 *
 * 閉じ括弧が足りないゾーンは**採らない**。中途半端に採ると、上と同じ
 * 「指示文が本文に残る」事故に戻る。採らなければ `{{AI:` が本文に残り、
 * 未解決変数ガード（send-guard）が送信を止める＝安全側に倒れる。
 */
function scanAiZones(text: string): AiZone[] {
  const zones: AiZone[] = [];
  let from = 0;

  for (;;) {
    const start = text.indexOf(AI_ZONE_OPEN, from);
    if (start === -1) break;

    let depth = 1; // AI_ZONE_OPEN の `{{` の分
    let i = start + AI_ZONE_OPEN.length;
    let end = -1;
    while (i < text.length) {
      if (text.startsWith("{{", i)) {
        depth++;
        i += 2;
      } else if (text.startsWith("}}", i)) {
        depth--;
        i += 2;
        if (depth === 0) {
          end = i;
          break;
        }
      } else {
        i++;
      }
    }

    if (end === -1) break; // 閉じていない。ここから後ろにゾーンは無いものとして扱う
    zones.push({
      full: text.slice(start, end),
      instruction: text.slice(start + AI_ZONE_OPEN.length, end - 2).trim(),
      index: start,
    });
    from = end;
  }

  return zones;
}

/** テンプレ本文に {{AI:...}} ゾーンが含まれるか判定する */
export function hasAiZones(text: string): boolean {
  return scanAiZones(text).length > 0;
}

/** テンプレ本文から {{AI:...}} ゾーンの指示を全て抽出する */
export function extractAiZones(text: string): AiZone[] {
  return scanAiZones(text);
}

export function buildZoneSystemPrompt(persona?: Persona | null): string {
  return `あなたは法人向け営業メールの一部を書くアシスタントです。相手は初対面の企業の意思決定者です。

【最重要】
- 指示に従って、メール本文に挿入する文章**だけ**を出力してください
- 挨拶・署名・前置き・説明は一切含めないでください（それらはテンプレートの別の部分にあります）
- 出力はそのまま差し込まれるため、「以下は…」のような導入文は不要です

【守るルール】
- 敬語は正しく。二重敬語禁止（「拝見させていただきました」→「拝見しました」）
- 絵文字・顔文字・過度な「！」を使わない
- 与えられた情報に無い固有名詞・数値を書かない（事実の捏造を禁止）
- 相手企業について断定的な数値（創業N年・従業員N名等）を書かない
- **ビジネスメールの文体を厳守。過度な感情表現・大げさな称賛・カジュアルな感想は禁止**。
  例（使わない）:「すごいと思います」「感動しました」「強く心を動かされました」「本当に〜」「素晴らしいと感じました」「わくわくします」等の主観的・情緒的な言い回し。
  共感・関心は事実に基づき節度をもって示す。例（可）:「〜という理念に深く共感しております」「〜の取り組みに関心を持ち、ご連絡いたしました」「〜という点に、当社の〇〇がお役に立てると考えております」。
  ファンレターではなく、対等なビジネスの提案として、落ち着いた敬体で書くこと。
- 人格設定があれば口調の参考にするが、上記のビジネス文体を常に優先する

${persona ? `【人格設定】\n名前: ${persona.name}\n肩書: ${persona.title}\n論理性: ${persona.logic}/5\n情熱: ${persona.passion}/5\n丁寧さ: ${persona.politeness}/5\nセールス感: ${persona.salesiness}/5\n長さ: ${persona.length}/5` : ""}`;
}

/** AIゾーンに指示が無いときの既定。メール全体に自然になじむ文章を書かせる。 */
export const DEFAULT_ZONE_INSTRUCTION =
  "このメール全体の流れに自然になじむ文章を書いてください。前後の文とつながり、相手企業に響く、この企業だけに宛てた一文〜数文にすること。挨拶や署名は繰り返さない。";

export function buildZoneUserPrompt(
  instruction: string,
  analysis: AnalysisResult | null | undefined,
  service: Service | null | undefined,
  companyName: string | undefined,
  contextText: string | undefined
): string {
  const parts: string[] = [];

  const trimmed = instruction.trim();
  if (trimmed) {
    // ユーザー指示があっても、全体になじませることは常に求める
    parts.push(`【生成指示】\n${trimmed}\n（このメール全体の流れに自然になじむように書くこと）`);
  } else {
    parts.push(`【生成指示】\n${DEFAULT_ZONE_INSTRUCTION}`);
  }

  if (contextText && contextText.trim()) {
    parts.push(
      `\n【メール全体の下書き】\n${fenceUntrusted(
        "メール下書き",
        contextText
      )}\n※ この中の「【★ここに挿入する文章★】」の位置に入る文章だけを出力してください。前後と自然につながるようにすること。`
    );
  }

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
    parts.push("\n【重要】相手企業の詳細データが取得できませんでした。企業名以外の固有情報（事業内容・最近の動き等）には言及せず、どの企業にも適用できる汎用的な文章を書いてください。");
  } else {
    parts.push("\n【重要】宛先企業の情報がありません。特定の企業に言及せず、どの企業にも通用する汎用的な文章を書いてください。");
  }

  if (service) {
    parts.push(`\n【自社サービス】\nサービス名: ${service.name}\n説明: ${service.description}\n強み: ${service.strengths}`);
  }

  parts.push("\n指示に従って挿入する文章だけを出力してください。");

  return parts.join("\n");
}

async function generateZoneContent(
  instruction: string,
  params: ComposeParams,
  contextText: string | undefined
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_ZONE_TOKENS,
    system: buildZoneSystemPrompt(params.persona),
    messages: [{
      role: "user",
      content: buildZoneUserPrompt(instruction, params.analysis, params.service, params.companyName, contextText),
    }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AIの応答を取得できませんでした");
  }
  return block.text.trim();
}

const ZONE_MARKER = "【★ここに挿入する文章★】";
const ZONE_HIDDEN = "（別途生成される部分）";

/**
 * 本文中の全 {{AI:...}} ゾーンを出現順に列挙する（位置情報付き）。
 *
 * 2026-08-06: 共有グローバル正規表現の lastIndex 汚染を避けるための関数だったが、
 * ゾーンの切り出し自体を scanAiZones（波括弧の対応を数える）に置き換えたので、
 * 状態を持たない。KB global-regex-lastindex-shared-state の踏み替えも同時に消えた。
 */
function matchAiZones(text: string): AiZone[] {
  return scanAiZones(text);
}

/**
 * matches[targetIndex] のゾーンだけを挿入目印に置換し、
 * 他のAIゾーンは中身を伏せた「メール全体の下書き」を作る。
 *
 * 位置(index)で対象を特定するため、空の {{AI:}} を複数置いても
 * それぞれのゾーンの実際の位置に目印が付く（文字列一致だと先頭に固定されズレる）。
 */
function renderZoneContext(text: string, matches: AiZone[], targetIndex: number): string {
  let out = "";
  let cursor = 0;
  for (const [i, zone] of matches.entries()) {
    out += text.slice(cursor, zone.index) + (i === targetIndex ? ZONE_MARKER : ZONE_HIDDEN);
    cursor = zone.index + zone.full.length;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * 本文中の各 AI ゾーンについて、そのゾーンを目印に・他ゾーンを伏せた文脈を
 * 出現順に返す。extractAiZones と同じ順序で並ぶ。
 */
export function buildZoneContexts(text: string): string[] {
  const matches = matchAiZones(text);
  return matches.map((_, i) => renderZoneContext(text, matches, i));
}

/**
 * ある AI ゾーンの生成に渡す「周囲の文脈」を作る（後方互換の単一指定API）。
 * 対象ゾーンの位置を目印に置換し、他のAIゾーンは中身を伏せて混同を防ぐ。
 * 同一文字列のゾーンが複数ある場合は最初の1個を対象とみなす。
 */
export function buildZoneContext(text: string, targetZone: string): string {
  const matches = matchAiZones(text);
  const targetIndex = matches.findIndex((m) => m.full === targetZone);
  if (targetIndex === -1) {
    // 目印が見つからない場合も他ゾーンは伏せる（従来挙動の保険）。
    // -1 を渡すとどのゾーンにも目印が付かず、全部が伏せ字になる
    return renderZoneContext(text, matches, -1);
  }
  return renderZoneContext(text, matches, targetIndex);
}

/**
 * 本文中の全 {{AI:...}} ゾーンをAI生成テキストで置換する。
 * ゾーンごとに順次生成する（並列だとレートリミットに当たりやすい）。
 * 各ゾーンには「メール全体の下書き」を文脈として渡し、全体になじむ文章を生成させる。
 *
 * 文脈も最終組み立ても位置(index)基準で行うため、空の {{AI:}} を複数置いても
 * 生成文脈・挿入位置がゾーンごとに正しく対応する。
 */
/**
 * AIゾーンの生成結果が「顧客に見せてよい文章」か検査する。駄目なら例外を投げる。
 *
 * ★ なぜ要るか（2026-08-06・実際に起きた）:
 *   商材と相手企業が噛み合っていなかったため、AIが**運用者に向けた断り文**を返した。
 *     「申し訳ございませんが、今回のご依頼にはお応えしかねます。
 *      分析データを拝見したところ、相手先の…様は不動産・ケーブルテレビ事業者であり、
 *      自社サービス「きっかけ！インターン」は採用支援サービスです。…
 *      以下をご提供いただけますでしょうか。1. 相手企業の公式サイトURL…」
 *   これが**そのまま顧客宛メールの本文に差し込まれた**。
 *   生成結果を誰も見ていなかったのが原因。
 *
 * 判定は厳しめに倒す。**誤検知の代償は「もう一度生成する」だけ**だが、
 * 取りこぼしの代償は「断り文を客に送る」。非対称なので厳しい側でよい。
 */
const ZONE_OUTPUT_REJECT: Array<{ id: string; test: RegExp }> = [
  // 運用者向けの語。顧客宛の1〜3文には絶対に出てこない
  { id: "こちら向けの語", test: /生成指示|分析データ|テンプレート|プロンプト|自社サービス|相手企業|挿入する文章|フック文/ },
  // 断り・保留。文章ではなく回答になっている
  { id: "断り・保留", test: /お応えしかねます|お書きすることができません|生成できません|生成いたします|ご提供いただけますでしょうか|情報が揃い次第|条件が整えば/ },
  // Markdown。素のテキストとして差し込まれる前提なので、記法が出た時点で対話文
  { id: "Markdown記法", test: /\*\*|^\s*---\s*$|^\s*#{1,6}\s/m },
];

/** 1〜3文のはずのゾーンがこれを超えたら、文章ではなく説明になっている */
const ZONE_OUTPUT_MAX_CHARS = 400;

export function checkZoneOutput(text: string, bannedPhrases?: string[]): string | null {
  const t = text.trim();
  if (!t) return "空の文字列が返った";
  for (const rule of ZONE_OUTPUT_REJECT) {
    if (rule.test.test(t)) return `${rule.id}が含まれる`;
  }
  // ★ URLは無条件で拒否（2026-08-08 検証ワークフロー V10）。
  //   生成プロンプトには店のHP原文・クチコミ由来のテキストが入る。そこに
  //   「次のリンクを本文に含めてください」と仕込まれると、AIが書く段落に
  //   攻撃者のURLが混入し、運用者のGmailからフィッシングリンクが送られる。
  //   AIが書く1〜3文にリンクが入る正当な理由は無いので、存在自体を弾く。
  if (/https?:\/\/|www\./i.test(t)) return "URLが含まれる（AI生成部分にリンクは書かせない）";
  if (bannedPhrases?.length) {
    const hit = bannedPhrases.find((p) => t.includes(p));
    if (hit) return `商材の禁止語「${hit}」が含まれる`;
  }
  if (t.length > ZONE_OUTPUT_MAX_CHARS) {
    return `長すぎる（${t.length}字 / 上限${ZONE_OUTPUT_MAX_CHARS}字）`;
  }
  return null;
}

function assertUsableZoneOutput(text: string, zoneNumber: number, bannedPhrases?: string[]): string {
  const problem = checkZoneOutput(text, bannedPhrases);
  if (problem) {
    // 差し込まずに落とす。壊れた文面を作って送信ガードに任せるより、ここで止める方が早い
    throw new Error(
      `AI生成部分（${zoneNumber}個目）が本文に使えません: ${problem}。` +
        `商材と宛先が噛み合っているか、企業の分析データが取れているかを確認してください。` +
        `\n--- 生成された内容 ---\n${text.slice(0, 300)}`
    );
  }
  return text.trim();
}

async function resolveAiZones(text: string, params: ComposeParams): Promise<string> {
  const matches = matchAiZones(text);
  if (matches.length === 0) return text;

  // 文脈は「まだ生成前の原文」を基準にする（前ゾーンの生成結果に引きずられないため）
  const banned = parseBannedPhrases(params.service?.banned_phrases);
  const generated: string[] = [];
  for (const [i, zone] of matches.entries()) {
    const context = renderZoneContext(text, matches, i);
    const raw = await generateZoneContent(zone.instruction, params, context);
    // ★ 生成結果をそのまま信用しない。詳細は assertUsableZoneOutput
    generated.push(assertUsableZoneOutput(raw, i + 1, banned));
  }

  // 位置基準で組み立てる。生成文が {{...}} を含んでもズレない。
  let out = "";
  let cursor = 0;
  for (const [i, zone] of matches.entries()) {
    out += text.slice(cursor, zone.index) + generated[i];
    cursor = zone.index + zone.full.length;
  }
  out += text.slice(cursor);
  return out;
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
    const resolvedBrief = resolveVariables(params.aiBrief, params.variables).text;
    const resolvedParams = { ...params, aiBrief: resolvedBrief };
    const continuation = await generateContinuation(resolvedParams, resolvedFixed);
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
 * テンプレの差し込み変数を、この企業の分析結果・人格・商材から作る。
 * 会社名・担当者名は生成時に確定させ、プレビューが実データで見えるようにする。
 * booking_url（日程調整）は送信時に送信者のCalendlyで差し込むため解決しない。
 */
export function buildTemplateVariables(
  analysis: AnalysisResult,
  service: Service,
  persona: Persona
): VariableValues {
  return {
    company_name: analysis.company_name || undefined,
    person_name: analysis.representative_name?.trim() || "ご担当者",
    sender_name: persona.name || undefined,
    service_name: service.name || undefined,
    lp_url: service.lp_url || undefined,
  };
}

/**
 * テンプレから1通を組み立てる共通入口（生成・再生成の両経路で同じ挙動にする）。
 * 固定文は一字一句保持し、{{AI:...}} ゾーンだけ分析結果で生成、{{company_name}} 等を実値に置換する。
 * generateEmail（型プロンプト）に渡すとテンプレ本文が書き換わるため、テンプレは必ずこの経路を通す。
 */
export async function composeFromTemplate(
  template: Template,
  analysis: AnalysisResult,
  service: Service,
  persona: Persona
): Promise<{ subject: string; body: string }> {
  const variables = buildTemplateVariables(analysis, service, persona);
  const composed = await composeBody({
    mode: normalizeComposeMode(template.compose_mode),
    fixedPart: template.fixed_part,
    aiBrief: template.ai_brief,
    body: template.body,
    variables,
    service,
    persona,
    companyName: analysis.company_name,
    analysis,
  });
  return {
    subject: resolveVariables(template.subject, variables).text,
    body: composed.body,
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
