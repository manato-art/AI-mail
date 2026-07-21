import dns from "node:dns/promises";

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
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // リンクローカル。169.254.169.254 はクラウドの認証情報エンドポイント
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  // CGNAT
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,
];

/** IPv6 のループバック・リンクローカル・ユニークローカル */
const PRIVATE_IPV6_PATTERNS: RegExp[] = [
  /^::1$/,
  /^::$/,
  /^fe80:/i,
  /^f[cd][0-9a-f]{2}:/i,
  // IPv4射影アドレス（::ffff:127.0.0.1 / ::ffff:7f00:1）
  /^::ffff:/i,
];

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "::1",
  // クラウドのメタデータサービス
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

/** 生のIP文字列（IPv4/IPv6）がプライベート/リンクローカル/メタデータ範囲か判定する */
export function isPrivateIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (PRIVATE_IPV6_PATTERNS.some((p) => p.test(normalized))) return true;
  return PRIVATE_IPV4_PATTERNS.some((p) => p.test(normalized));
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (PRIVATE_HOSTNAMES.has(normalized)) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  // .internal / .local は内部ネットワーク向けの名前空間
  if (normalized.endsWith(".internal") || normalized.endsWith(".local")) {
    return true;
  }

  if (PRIVATE_IPV6_PATTERNS.some((pattern) => pattern.test(normalized))) {
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

/**
 * validateUrl（文字列検証）に加えて、ホスト名を実際にDNS解決し、
 * 解決された全IPがプライベート/内部IPでないことを検証する。
 *
 * 文字列検証だけでは「公開ドメインだがAレコードが 127.0.0.1 や
 * 169.254.169.254（クラウドメタデータ）を指す」偽装ドメインを防げない。
 * fetch する直前にこの関数を通すこと。
 *
 * 注: 解決と実接続の間でDNSが差し替わるDNSリバインディング（TOCTOU）は
 * この方式では完全には塞げない。より厳密にはundiciのカスタムlookupで
 * 接続先IPを固定する必要がある（現状は依存追加を避け未実装）。
 */
export async function validateUrlWithDns(urlStr: string): Promise<UrlValidationResult> {
  const base = validateUrl(urlStr);
  if (!base.valid) return base;

  const hostname = new URL(base.normalized).hostname.replace(/^\[/, "").replace(/\]$/, "");

  // ホスト名がIPリテラルなら文字列検証で既に判定済み。DNS解決は不要。
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    return base;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return { valid: false, normalized: base.normalized, error: "ホスト名を解決できませんでした" };
  }

  if (addresses.length === 0) {
    return { valid: false, normalized: base.normalized, error: "ホスト名を解決できませんでした" };
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      return {
        valid: false,
        normalized: base.normalized,
        error: "内部ネットワーク宛てのため接続できません（DNS解決結果がプライベートIP）",
      };
    }
  }

  return { valid: true, normalized: base.normalized };
}
