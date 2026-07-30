import { NextResponse } from "next/server";
import { getSendEvidenceMap } from "@/lib/db";

/**
 * prospect_id → 最新の送信記録（送信時刻・宛先・GmailメッセージID）＋通算回数の辞書。
 * 履歴一覧で「送信済」の横に実際の送信時刻を出すために使う（ステータスの申告ではなく記録）。
 */
export function GET() {
  return NextResponse.json(getSendEvidenceMap());
}
