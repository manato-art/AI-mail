import { NextResponse } from "next/server";
import { resetFailedEnrichments } from "@/lib/db";

/**
 * 調査に失敗した企業を裏処理の待ち行列に戻す。
 * 検索APIの一時的な不調でまとめて失敗することがあるため、まとめて戻せるようにする。
 */
export async function POST() {
  const reset = resetFailedEnrichments();
  return NextResponse.json({ reset });
}
