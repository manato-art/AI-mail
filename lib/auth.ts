/**
 * 画面・APIの簡易パスワード保護。
 *
 * 本番URLは公開されているため、これが無いとURLを知っている第三者が
 * 自社Gmailからメールを送れてしまう。将来 Cloudflare Access 等へ
 * 移行できるよう、認証の判定はこのファイルに閉じ込めている。
 *
 * proxy.ts（Edge でも動きうる）から呼ばれるため Node の crypto ではなく
 * Web Crypto API を使う。
 */

export const SESSION_COOKIE = "sm_session";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/** これより短いパスワードは総当たりに耐えないので起動時に警告する */
export const MIN_PASSWORD_LENGTH = 12;

export function getAppPassword(): string {
  return process.env.APP_PASSWORD?.trim() ?? "";
}

export function isAuthEnabled(): boolean {
  return getAppPassword().length > 0;
}

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** 長さの差から情報が漏れないよう、ハッシュ同士を定数時間で比較する */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(input: string): Promise<boolean> {
  const expected = getAppPassword();
  if (!expected) return false;
  const [inputHash, expectedHash] = await Promise.all([
    hmac(expected, `pw:${input}`),
    hmac(expected, `pw:${expected}`),
  ]);
  return timingSafeEqual(inputHash, expectedHash);
}

/**
 * セッショントークン = `期限.署名`。
 * 署名鍵にパスワード自体を使うので、パスワードを変えると既存セッションが全て無効になる。
 */
export async function createSessionToken(nowMs: number): Promise<string> {
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SEC;
  const signature = await hmac(getAppPassword(), String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, nowMs: number): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < nowMs) return false;

  const expected = await hmac(getAppPassword(), String(expiresAt));
  return timingSafeEqual(signature, expected);
}
