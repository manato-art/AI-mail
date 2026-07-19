import type { AnalysisResult, QualityCheckResult, SendGuardResult } from "@/lib/types";

const MIN_BODY_LENGTH = 200;
const MAX_BODY_LENGTH = 450;
const MIN_SUBJECT_LENGTH = 15;
const MAX_SUBJECT_LENGTH = 40;
const HOOK_FRAGMENT_LENGTH = 10;

const COMMERCIAL_CLOSE_KEYWORDS = [
  "打ち合わせ",
  "ご説明",
  "お時間",
  "ミーティング",
  "商談",
];

const GENERIC_PHRASES = ["貴社のような企業様"];

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const UNRESOLVED_VARIABLE_PATTERN = /\{\{[^}]+\}\}/g;

function extractBodyWithoutSignature(body: string): string {
  const signatureIndex = body.indexOf("━━━");
  if (signatureIndex === -1) {
    return body;
  }
  return body.slice(0, signatureIndex);
}

export function validateEmail(
  body: string,
  subject: string,
  analysis: AnalysisResult
): QualityCheckResult {
  const issues: string[] = [];

  const mainBody = extractBodyWithoutSignature(body).trim();
  const bodyLength = mainBody.length;
  if (bodyLength < MIN_BODY_LENGTH || bodyLength > MAX_BODY_LENGTH) {
    issues.push(
      `本文の文字数が範囲外です（${bodyLength}字、${MIN_BODY_LENGTH}〜${MAX_BODY_LENGTH}字が目安）`
    );
  }

  if (analysis.company_name && !body.includes(analysis.company_name)) {
    issues.push("本文に相手企業名が含まれていません");
  }

  if (analysis.hook) {
    const hookFragment = analysis.hook.slice(0, HOOK_FRAGMENT_LENGTH);
    if (hookFragment && !body.includes(hookFragment)) {
      issues.push("本文に相手企業固有のフックが反映されていません");
    }
  }

  const hasCommercialClose = COMMERCIAL_CLOSE_KEYWORDS.some((keyword) =>
    body.includes(keyword)
  );
  if (!hasCommercialClose) {
    issues.push("商談・打ち合わせへの誘導表現が含まれていません");
  }

  if (EMOJI_PATTERN.test(body)) {
    issues.push("本文に絵文字が含まれています");
  }

  const exclamationCount = (body.match(/[！!]/g) || []).length;
  if (exclamationCount > 1) {
    issues.push(`「！」の使用が多すぎます（${exclamationCount}個、上限1個）`);
  }

  for (const phrase of GENERIC_PHRASES) {
    if (body.includes(phrase)) {
      issues.push(`汎用的すぎる表現が含まれています:「${phrase}」`);
    }
  }

  const subjectLength = subject.trim().length;
  if (subjectLength < MIN_SUBJECT_LENGTH || subjectLength > MAX_SUBJECT_LENGTH) {
    issues.push(
      `件名の文字数が推奨範囲外です（${subjectLength}字、20〜35字が目安）`
    );
  }

  const subjectVars = subject.match(UNRESOLVED_VARIABLE_PATTERN) ?? [];
  const bodyVars = body.match(UNRESOLVED_VARIABLE_PATTERN) ?? [];
  const unresolvedVars = [...subjectVars, ...bodyVars];
  if (unresolvedVars.length > 0) {
    issues.push(
      `未解決の変数が残っています: ${unresolvedVars.join(", ")}`
    );
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

export function validateSendReady(subject: string, body: string): SendGuardResult {
  const reasons: string[] = [];

  const unresolvedVars = [
    ...(subject.match(UNRESOLVED_VARIABLE_PATTERN) ?? []),
    ...(body.match(UNRESOLVED_VARIABLE_PATTERN) ?? []),
  ];
  if (unresolvedVars.length > 0) {
    reasons.push(`未解決の変数: ${unresolvedVars.join(", ")}`);
  }

  const hasSignature = body.includes("━━━") || body.includes("---");
  if (!hasSignature) {
    reasons.push("署名ブロックが検出されません");
  }

  return { canSend: reasons.length === 0, reasons };
}
