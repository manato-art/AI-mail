/**
 * 差し込み変数の解決エンジン（仕様書 F4 / F9）。
 *
 * 解決できなかった変数は「空文字で埋める」のではなく原文のまま残す。
 * 残った `{{...}}` は送信ガード（lib/send-guard.ts）が検知して送信をブロックするため、
 * 値の無い変数が空欄のまま相手に届く事故が構造的に起きない。
 */

export const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export const SUPPORTED_VARIABLES = [
  "company_name",
  "person_name",
  "sender_name",
  "service_name",
  "lp_url",
  "booking_url",
] as const;

export type VariableKey = (typeof SUPPORTED_VARIABLES)[number];

export type VariableValues = Partial<Record<VariableKey, string | null | undefined>>;

export interface ResolveResult {
  text: string;
  /** 値が無く未解決のまま残した変数名（重複なし） */
  unresolved: string[];
  /** SUPPORTED_VARIABLES に無い変数名（テンプレの打ち間違い等・重複なし） */
  unknown: string[];
}

function isSupported(name: string): name is VariableKey {
  return (SUPPORTED_VARIABLES as readonly string[]).includes(name);
}

/**
 * 1つの文字列の変数を解決する。値が空・未定義のものは置換せず原文を残す。
 */
export function resolveVariables(text: string, values: VariableValues): ResolveResult {
  const unresolved = new Set<string>();
  const unknown = new Set<string>();

  const resolved = text.replace(VARIABLE_PATTERN, (match, rawName: string) => {
    const name = rawName.trim();

    if (!isSupported(name)) {
      unknown.add(name);
      return match;
    }

    const value = values[name];
    if (typeof value !== "string" || value.trim() === "") {
      unresolved.add(name);
      return match;
    }

    return value;
  });

  return {
    text: resolved,
    unresolved: [...unresolved],
    unknown: [...unknown],
  };
}

export interface ResolvedEmail {
  subject: string;
  body: string;
  unresolved: string[];
  unknown: string[];
}

/**
 * 件名と本文をまとめて解決する。件名・本文で出た未解決/未知はマージして返す。
 */
export function resolveEmailVariables(
  subject: string,
  body: string,
  values: VariableValues
): ResolvedEmail {
  const resolvedSubject = resolveVariables(subject, values);
  const resolvedBody = resolveVariables(body, values);

  return {
    subject: resolvedSubject.text,
    body: resolvedBody.text,
    unresolved: [...new Set([...resolvedSubject.unresolved, ...resolvedBody.unresolved])],
    unknown: [...new Set([...resolvedSubject.unknown, ...resolvedBody.unknown])],
  };
}

/**
 * テンプレート中で使われている変数名を列挙する（編集UIのプレビュー用）。
 */
export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1].trim());
  }
  return [...found];
}
