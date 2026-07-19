import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE_SEC } from "@/lib/oauth-state";

export async function GET() {
  try {
    // CSRF対策: この値を cookie と state の両方に入れ、コールバックで一致を確認する。
    // 無いと、攻撃者が自分のGmailの認可コードを踏ませて送信元アカウントを勝手に登録できる
    const state = crypto.randomUUID();
    const url = getAuthUrl(state);

    const response = NextResponse.json({ url });
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_STATE_MAX_AGE_SEC,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "OAuth credentials not configured" },
      { status: 500 }
    );
  }
}
