import { NextResponse } from "next/server";
import { getSendCountsByDomain } from "@/lib/db";

/** ドメイン→通算送信数の辞書。履歴の「この会社へ通算◯通」表示に使う */
export function GET() {
  return NextResponse.json(getSendCountsByDomain());
}
