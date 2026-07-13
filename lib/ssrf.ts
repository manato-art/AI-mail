export interface UrlValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
];

const PRIVATE_HOSTNAMES = new Set(["localhost", "::1"]);

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (PRIVATE_HOSTNAMES.has(normalized)) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasExplicitProtocol(urlStr: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(urlStr);
}

export function validateUrl(urlStr: string): UrlValidationResult {
  const trimmed = urlStr.trim();

  if (!trimmed) {
    return { valid: false, normalized: "", error: "URLが空です" };
  }

  const candidate = hasExplicitProtocol(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, normalized: candidate, error: "URLの形式が不正です" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      normalized: parsed.toString(),
      error: "http または https のURLのみ利用できます",
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      normalized: parsed.toString(),
      error: "URLにホスト名が含まれていません",
    };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return {
      valid: false,
      normalized: parsed.toString(),
      error: "プライベートIP・ローカルホストへのアクセスは許可されていません",
    };
  }

  return { valid: true, normalized: parsed.toString() };
}
