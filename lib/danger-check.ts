/**
 * 危険ワード・事実誤認の検知（仕様書 F18）— 送信前の最終ゲート。
 *
 * AIが相手企業について事実を捏造するのが最悪の営業事故なので、
 * 生成時だけでなく送信直前にも通す。ブロック（送信不可）と警告（人が判断して押し切れる）を分ける。
 */

import type { AnalysisResult, Persona, Service } from "@/lib/types";

export interface DangerFinding {
  severity: "block" | "warn";
  message: string;
}

export interface DangerCheckResult {
  /** ブロック相当の指摘が1件も無い */
  canSend: boolean;
  blocks: string[];
  warnings: string[];
}

/** 数値+単位の主張（「3,000社」「創業50年」「120%」など） */
const NUMERIC_CLAIM_PATTERN =
  /\d+(?:[.,]\d+)*\s*(?:社|名|人|件|年|ヶ月|ケ月|カ月|か月|ヵ月|週間|日間|時間|%|％|割|倍|位|冠|周年|億|万|千|円|点|種類)/g;

const ABBREVIATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /㈱|\(株\)|（株）/, label: "(株)" },
  { pattern: /㈲|\(有\)|（有）/, label: "(有)" },
  { pattern: /\(合\)|（合）/, label: "(合)" },
];

const EXAGGERATION_WORDS = [
  "No.1",
  "no.1",
  "NO.1",
  "ナンバーワン",
  "ナンバー1",
  "日本一",
  "業界唯一",
  "唯一無二",
  "必ず",
  "絶対に",
  "100%",
  "１００％",
  "完全無料",
  "最高峰",
  "他社にはない",
  "圧倒的No",
];

const DOUBLE_HONORIFICS = [
  "拝見させていただ",
  "お伺いさせていただ",
  "拝読させていただ",
  "ご覧になられ",
  "おっしゃられ",
  "お召し上がりになられ",
  "承らせていただ",
];

const LOW_COMPATIBILITY_OVERCLAIMS = [
  "まさに御社にぴったり",
  "御社に最適",
  "貴社に最適",
  "まさに貴社",
  "御社にうってつけ",
  "最適なソリューション",
];

/** 全角→半角・カンマ除去。表記ゆれ（3,000社 と 3000社）を同一視するため */
function normalizeNumeric(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "")
    .replace(/[．]/g, ".")
    .replace(/[％]/g, "%")
    .replace(/\s+/g, "");
}

function extractNumericClaims(text: string): string[] {
  const normalized = normalizeNumeric(text);
  return [...new Set(normalized.match(NUMERIC_CLAIM_PATTERN) ?? [])];
}

/**
 * 「本文に書いてよい事実」の母集合。分析結果に加え、自社商材・人格（署名）も含める。
 * 自社について書いた数値まで幻覚扱いすると全部ブロックされてしまうため。
 */
function buildAllowedCorpus(
  analysis: AnalysisResult,
  service?: Service | null,
  persona?: Persona | null
): string {
  const parts: (string | null | undefined)[] = [
    analysis.company_name,
    analysis.representative_name,
    analysis.business_summary,
    ...(analysis.activities ?? []),
    ...(analysis.recent_topics ?? []),
    analysis.compatibility?.reason,
    ...(analysis.proposal_points ?? []),
    analysis.hook,
    service?.name,
    service?.description,
    service?.strengths,
    service?.target,
    service?.lp_url,
    service?.pdf_extracted_text,
    persona?.name,
    persona?.title,
    persona?.company_name,
    persona?.signature_block,
  ];
  return parts.filter(Boolean).join(" ");
}

function checkHallucinatedNumbers(body: string, corpus: string): DangerFinding[] {
  const allowed = new Set(extractNumericClaims(corpus));
  const claimed = extractNumericClaims(body);
  const invented = claimed.filter((claim) => !allowed.has(claim));

  if (invented.length === 0) return [];
  return [
    {
      severity: "block",
      message: `分析結果・商材情報に存在しない数値が本文にあります（事実誤認の疑い）: ${invented.join("、")}`,
    },
  ];
}

function checkCompanyName(body: string, analysis: AnalysisResult): DangerFinding[] {
  const findings: DangerFinding[] = [];
  const name = analysis.company_name?.trim();

  if (name && !body.includes(name)) {
    findings.push({
      severity: "block",
      message: `本文に相手企業の正式名称「${name}」が含まれていません（宛先取り違えの疑い）`,
    });
  }

  for (const { pattern, label } of ABBREVIATION_PATTERNS) {
    if (pattern.test(body)) {
      findings.push({
        severity: "block",
        message: `社名が略記されています（${label}）。正式名称で表記してください`,
      });
    }
  }

  return findings;
}

function checkWordList(
  body: string,
  words: string[],
  severity: DangerFinding["severity"],
  label: string
): DangerFinding[] {
  const hits = words.filter((word) => body.includes(word));
  if (hits.length === 0) return [];
  return [{ severity, message: `${label}: ${hits.join("、")}` }];
}

function checkCompatibilityContradiction(
  body: string,
  analysis: AnalysisResult
): DangerFinding[] {
  if (analysis.compatibility?.score !== "low") return [];
  return checkWordList(
    body,
    LOW_COMPATIBILITY_OVERCLAIMS,
    "warn",
    "相性スコアが low なのに断定的な適合主張があります"
  );
}

export function runDangerCheck(params: {
  subject: string;
  body: string;
  analysis: AnalysisResult;
  service?: Service | null;
  persona?: Persona | null;
}): DangerCheckResult {
  const { subject, body, analysis, service, persona } = params;
  const corpus = buildAllowedCorpus(analysis, service, persona);
  const target = `${subject}\n${body}`;

  const findings: DangerFinding[] = [
    ...checkHallucinatedNumbers(target, corpus),
    ...checkCompanyName(body, analysis),
    ...checkWordList(target, EXAGGERATION_WORDS, "warn", "景品表示法リスクのある断定・誇大表現"),
    ...checkWordList(body, DOUBLE_HONORIFICS, "warn", "二重敬語"),
    ...checkCompatibilityContradiction(body, analysis),
  ];

  const blocks = findings.filter((f) => f.severity === "block").map((f) => f.message);
  const warnings = findings.filter((f) => f.severity === "warn").map((f) => f.message);

  return { canSend: blocks.length === 0, blocks, warnings };
}
