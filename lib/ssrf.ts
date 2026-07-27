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

/**
 * DNS解決の打ち切り時間（既定5秒）。
 *
 * dns.lookup にはタイムアウトが無く、応答しないDNSに当たると解決フェーズで無限に待つ。
 * crawl.ts の AbortController は fetch にしか効かないため、ここが止まると
 * 調査バッチは直列ループのまま進まず、収集ジョブのロックを握ったまま「実行中」が張り付く
 * （KB: untimed-fetch-hang-holds-job-lock）。env DNS_LOOKUP_TIMEOUT_MS で調整可。
 */
export const DNS_LOOKUP_TIMEOUT_MS = 5000;

function dnsTimeoutMs(): number {
  const raw = Number(process.env.DNS_LOOKUP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DNS_LOOKUP_TIMEOUT_MS;
}

/** dns.lookup を必ず打ち切る。タイムアウトしたら null（＝解決できなかった）を返す */
async function lookupWithTimeout(hostname: string): Promise<{ address: string }[] | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      dns.lookup(hostname, { all: true }),
      // unref しない。unref すると「解決も返らずタイマーも数えられない」状態になり、
      // 打ち切りが発火しないまま処理が宙に浮く。決着後は必ず finally で解除する
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), dnsTimeoutMs());
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  // 解決できない／時間内に返らない場合は「解決できなかった」として先へ進める。
  // ここで待ち続けると、1社のDNSハングがバッチ全体とジョブロックを巻き添えにする
  const addresses = await lookupWithTimeout(hostname);
  if (!addresses) {
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
