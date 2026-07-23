import { NextRequest, NextResponse } from "next/server";
import { cancelScheduledProspect } from "@/lib/db";

/** 予約送信を取り消す（未送信に戻す）。既に送信済み・送信中なら 409 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = cancelScheduledProspect(Number(id));
  if (!ok) {
    return NextResponse.json(
      { error: "予約の取消に失敗しました（既に送信済み、または予約ではありません）" },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true });
}
