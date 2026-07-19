import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";
import { encrypt } from "@/lib/crypto";
import { upsertSender } from "@/lib/db";

function buildRedirectUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}${path}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(buildRedirectUrl("/settings?gmail_error=access_denied"));
  }

  if (!code) {
    return NextResponse.redirect(buildRedirectUrl("/settings?gmail_error=no_code"));
  }

  try {
    const { refreshToken, email, displayName } = await exchangeCode(code);
    const encryptedToken = encrypt(refreshToken);

    upsertSender({
      email,
      display_name: displayName,
      google_refresh_token_encrypted: encryptedToken,
    });

    return NextResponse.redirect(buildRedirectUrl("/settings?gmail_success=true"));
  } catch {
    return NextResponse.redirect(buildRedirectUrl("/settings?gmail_error=token_exchange_failed"));
  }
}
