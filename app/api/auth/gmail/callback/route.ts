import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";
import { encrypt } from "@/lib/crypto";
import { upsertSender } from "@/lib/db";
import { OAUTH_STATE_COOKIE } from "@/lib/oauth-state";

function buildRedirectUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}${path}`;
}

/** state は使い捨て。どの経路で終わっても必ず消す */
function redirectClearingState(path: string): NextResponse {
  const response = NextResponse.redirect(buildRedirectUrl(path));
  response.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (error) {
    return redirectClearingState("/settings?gmail_error=access_denied");
  }

  // state 不一致 = この画面から始まっていない認可。
  // 検証しないと、攻撃者が自分のGmailの認可コードを踏ませて
  // 送信元アカウントを勝手に登録できてしまう
  if (!state || !expectedState || state !== expectedState) {
    return redirectClearingState("/settings?gmail_error=invalid_state");
  }

  if (!code) {
    return redirectClearingState("/settings?gmail_error=no_code");
  }

  try {
    const { refreshToken, email, displayName } = await exchangeCode(code);
    const encryptedToken = encrypt(refreshToken);

    upsertSender({
      email,
      display_name: displayName,
      google_refresh_token_encrypted: encryptedToken,
    });

    return redirectClearingState("/settings?gmail_success=true");
  } catch {
    return redirectClearingState("/settings?gmail_error=token_exchange_failed");
  }
}
