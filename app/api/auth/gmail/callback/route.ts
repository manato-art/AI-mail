import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";
import { encrypt } from "@/lib/crypto";
import { upsertSender } from "@/lib/db";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=access_denied", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=no_code", request.url)
    );
  }

  try {
    const { refreshToken, email, displayName } = await exchangeCode(code);
    const encryptedToken = encrypt(refreshToken);

    upsertSender({
      email,
      display_name: displayName,
      google_refresh_token_encrypted: encryptedToken,
    });

    return NextResponse.redirect(
      new URL("/settings?gmail_success=true", request.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=token_exchange_failed", request.url)
    );
  }
}
