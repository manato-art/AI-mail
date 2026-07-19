import { NextRequest, NextResponse } from "next/server";
import { triggerCollectionJob } from "@/lib/collection-trigger";

/**
 * 外部cron（常時稼働PC 等）から叩く収集トリガ。
 *
 * cron はログインCookieを持てないため proxy.ts のパスワード保護から外してある。
 * その代わりトークンが必須で、未設定なら受け付けない
 * （無防備な状態で公開すると、誰でも収集を走らせられる）。
 *
 *   curl -X POST https://<host>/api/collection/cron \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */

const CRON_SECRET = process.env.CRON_SECRET?.trim() ?? "";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!timingSafeEqual(token, CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return triggerCollectionJob("cron");
}
