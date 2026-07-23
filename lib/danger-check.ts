/**
 * 危険ワード・事実誤認の検知（仕様書 F18）— 送信前の最終ゲート。
 *
 * AIが相手企業について事実を捏造するのが最悪の営業事故なので、
 * 生成時だけでなく送信直前にも通す。ブロック（送信不可）と警告（人が判断して押し切れる）を分ける。
 */

import { getContactByEmail } from "@/lib/db";
import { checkLegalDisclosures } from "@/lib/send-guard";
import { companyNamesConsistent } from "@/lib/email-domains";
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

/**
 * 相手企業を指す語。ハルシネーション照合はこの近傍の数値だけを対象にする。
 *
 * 全ての数値を照合対象にすると「3点ほどご提案」「1名が対応します」のような
 * 相手について何も主張していない定型表現まで弾いてしまい、送信機能が使えなくなる
 * （実測で正常な営業メール7件中5件が誤ブロックされた）。
 * 止めたいのは「創業50年の御社」のように相手企業について検証できない事実を書く行為。
 */
const TARGET_COMPANY_MARKERS = ["御社", "貴社", "貴店", "そちら"];

/** 宛名行（「◯◯株式会社 ご担当者様」等）。ここの社名は事実主張の文脈ではない */
const ADDRESSEE_LINE_PATTERN = /(?:様|御中|ご担当者)$/;

/** 西暦（2026年など）は事実主張ではないので照合から除く */
const CALENDAR_YEAR_PATTERN = /^(?:19|20)\d{2}年$/;

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

/**
 * 全角→半角・カンマ除去。表記ゆれ（3,000社 と 3000社）を同一視するため。
 * 改行は残す — 潰すと宛名行と本文が地続きになり、文脈判定が壊れる。
 */
function normalizeNumeric(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "")
    .replace(/[．]/g, ".")
    .replace(/[％]/g, "%")
    .replace(/[ \t　]+/g, "");
}

function extractNumericClaims(text: string): string[] {
  const normalized = normalizeNumeric(text);
  return [...new Set(normalized.match(NUMERIC_CLAIM_PATTERN) ?? [])];
}

/**
 * 相手企業に言及している行の数値だけを抜き出す。
 * 「3点ほどご提案します」は素通しし、「創業50年の御社」は拾う。
 * 判定を行単位にしているのは、日本語のメールでは1行がほぼ1つの文脈だから。
 */
function extractClaimsAboutTarget(text: string, companyName?: string | null): string[] {
  const markers = [...TARGET_COMPANY_MARKERS];
  const name = companyName ? normalizeNumeric(companyName) : "";
  if (name) markers.push(name);

  const claims = new Set<string>();
  for (const line of normalizeNumeric(text).split("\n")) {
    if (ADDRESSEE_LINE_PATTERN.test(line)) continue;
    if (!markers.some((marker) => line.includes(marker))) continue;

    for (const match of line.matchAll(NUMERIC_CLAIM_PATTERN)) {
      if (CALENDAR_YEAR_PATTERN.test(match[0])) continue;
      claims.add(match[0]);
    }
  }
  return [...claims];
}

/**
 * 照合の母集合として使える分析結果があるか。
 * 空の analysis（一括送信で作られた行など）で照合すると全ての数値が幻覚扱いになる。
 */
function hasUsableCorpus(analysis: AnalysisResult): boolean {
  return Boolean(analysis.company_name?.trim() || analysis.business_summary?.trim());
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

function checkHallucinatedNumbers(
  body: string,
  corpus: string,
  analysis: AnalysisResult
): DangerFinding[] {
  if (!hasUsableCorpus(analysis)) return [];

  const allowed = new Set(extractNumericClaims(corpus));
  const claimed = extractClaimsAboutTarget(body, analysis.company_name);
  const invented = claimed.filter((claim) => !allowed.has(claim));

  if (invented.length === 0) return [];
  return [
    {
      severity: "block",
      message: `相手企業について、分析結果に無い数値を書いています（事実誤認の疑い）: ${invented.join("、")}`,
    },
  ];
}

function checkCompanyName(body: string, analysis: AnalysisResult): DangerFinding[] {
  const findings: DangerFinding[] = [];
  const name = analysis.company_name?.trim();

  if (!name) {
    // 照合対象が無いので機械検知が働かないことを可視化する（ブロックはしない）
    findings.push({
      severity: "warn",
      message: "企業名が未設定のため、宛先取り違えの機械検知ができません",
    });
  } else if (!body.includes(name)) {
    findings.push({
      severity: "warn",
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

/**
 * 宛名の企業名が、宛先メールアドレスの企業と食い違っていないかを見る（仕様書F4）。
 * 誤差し込みは最悪の営業事故なので、登録済み連絡先と一致しない場合はブロックする。
 *
 * 未登録のアドレスは判定材料が無いので何も言わない（新規宛先を弾かないため）。
 */
function checkRecipientMatchesCompany(
  toEmail: string | undefined,
  companyName: string | undefined
): DangerFinding[] {
  const name = companyName?.trim();
  if (!toEmail || !name) return [];

  let registered;
  try {
    registered = getContactByEmail(toEmail);
  } catch {
    return [];
  }
  if (!registered) return [];

  const known = registered.company_name?.trim();
  if (!known || known === name) return [];

  // 法人格ゆれ（株式会社↔無印）や読み仮名の（）注記の違いは同一企業。
  // 完全一致でしか通さないと「株式会社H4」と「株式会社H4（エイチフォー）」等を
  // 誤って別会社と判定してブロックしてしまうので、正規化して照合する。
  const stripParen = (s: string) => s.replace(/[（(][^）)]*[）)]/g, "");
  if (companyNamesConsistent(stripParen(known), stripParen(name))) return [];

  return [
    {
      severity: "block",
      message: `宛先 ${toEmail} は「${known}」として登録されていますが、本文は「${name}」宛になっています（差し込み間違いの疑い）`,
    },
  ];
}

export function runDangerCheck(params: {
  subject: string;
  body: string;
  analysis: AnalysisResult;
  service?: Service | null;
  persona?: Persona | null;
  /** F4: 誤差し込み検知に使う。テストモードでも実際の宛先を渡すこと */
  toEmail?: string;
}): DangerCheckResult {
  const { subject, body, analysis, service, persona, toEmail } = params;
  const corpus = buildAllowedCorpus(analysis, service, persona);
  const target = `${subject}\n${body}`;

  const legalMissing = checkLegalDisclosures(body, persona?.company_name);

  const findings: DangerFinding[] = [
    ...checkHallucinatedNumbers(target, corpus, analysis),
    ...checkCompanyName(body, analysis),
    ...checkRecipientMatchesCompany(toEmail, analysis.company_name),
    ...(legalMissing.length > 0
      ? [
          {
            severity: "warn" as const,
            message: `特定電子メール法の表示事項が署名に見当たりません: ${legalMissing.join("、")}`,
          },
        ]
      : []),
    ...checkWordList(target, EXAGGERATION_WORDS, "warn", "景品表示法リスクのある断定・誇大表現"),
    ...checkWordList(body, DOUBLE_HONORIFICS, "warn", "二重敬語"),
    ...checkCompatibilityContradiction(body, analysis),
  ];

  const blocks = findings.filter((f) => f.severity === "block").map((f) => f.message);
  const warnings = findings.filter((f) => f.severity === "warn").map((f) => f.message);

  return { canSend: blocks.length === 0, blocks, warnings };
}
