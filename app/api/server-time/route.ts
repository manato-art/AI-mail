import { NextResponse } from "next/server";
import { getDbNow } from "@/lib/db";

/**
 * サーバとDBの現在時刻。日時表示の基準（DBの素の文字列がUTCか現地時刻か）を確かめるための診断用。
 *
 * DBは `datetime('now','localtime')` で書く列があるため、コンテナのTZ設定によって
 * 「素の日時文字列の意味」が変わる。dbNowLocal と dbNowUtc が一致していれば
 * サーバはUTCで動いており、素の文字列はUTCとして読むのが正しい。
 */
export function GET() {
  const now = getDbNow();
  return NextResponse.json({
    ...now,
    naiveStringsAre: now.dbNowLocal === now.dbNowUtc ? "utc" : "server-local",
    processTimezoneOffsetMinutes: new Date().getTimezoneOffset(),
    processTimezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
  });
}
