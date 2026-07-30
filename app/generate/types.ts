import type { AnalysisResult, Prospect, QualityCheckResult } from "@/lib/types";

/** 1社生成の状態機械。疑似進捗（crawling→analyzing→generating）と4分岐の結果を1つで表す */
export type Status =
  | "idle"
  | "crawling"
  | "analyzing"
  | "generating"
  | "done"
  | "error"
  | "duplicate"
  | "low-compat";

export interface GenerateSuccessResponse {
  prospect: Prospect;
  qualityCheck: QualityCheckResult;
}

export interface DuplicateResponse {
  duplicate: true;
  existingProspect: Prospect;
}

export interface LowCompatibilityResponse {
  lowCompatibility: true;
  analysis: AnalysisResult;
}

/** 送信済みの会社。生成せずに返る（AI費用と時間を捨てないため） */
export interface AlreadySentResponse {
  alreadySent: true;
  skipReason: string;
  domain: string;
}

export interface ErrorResponse {
  error: string;
  /** 時間を置けば直る種類か（自動リトライの判断に使う） */
  retryable?: boolean;
  /**
   * アカウント・設定側の問題（残高切れ・キー無効・モデル名間違い）。
   * どの会社でも同じく失敗するので、一括生成は続いたら止める。
   */
  fatal?: boolean;
}

export type GenerateResponse =
  | GenerateSuccessResponse
  | DuplicateResponse
  | LowCompatibilityResponse
  | AlreadySentResponse
  | ErrorResponse;

/**
 * 応答の判別は「成功 / 重複 / 送信済み / 相性低 / エラー」の5分岐を必ず網羅する。
 * 1つでも潰すと『重複なのに再生成』『送信済みに再生成』『相性低を警告なく生成』の退行になる。
 */
export function isSuccessResponse(
  data: GenerateResponse
): data is GenerateSuccessResponse {
  return (data as GenerateSuccessResponse).prospect !== undefined;
}

export function isDuplicateResponse(
  data: GenerateResponse
): data is DuplicateResponse {
  return (data as DuplicateResponse).duplicate === true;
}

export function isAlreadySentResponse(
  data: GenerateResponse
): data is AlreadySentResponse {
  return (data as AlreadySentResponse).alreadySent === true;
}

export function isLowCompatibilityResponse(
  data: GenerateResponse
): data is LowCompatibilityResponse {
  return (data as LowCompatibilityResponse).lowCompatibility === true;
}

export function isErrorResponse(data: GenerateResponse): data is ErrorResponse {
  return typeof (data as ErrorResponse).error === "string";
}

export const PROGRESS_STEPS = [
  { key: "crawling", label: "企業HPを取得中", sub: "Webサイトをクロールしています" },
  { key: "analyzing", label: "企業を分析中", sub: "事業内容と相性を判定しています" },
  { key: "generating", label: "メールを作成中", sub: "パーソナライズされた文面を生成しています" },
] as const;

export const STEP_DELAY_MS = 2000;
