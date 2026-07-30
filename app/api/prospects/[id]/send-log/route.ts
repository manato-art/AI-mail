import { NextRequest, NextResponse } from "next/server";
import { getProspect, getSendEvidenceByProspect } from "@/lib/db";

/**
 * 1件のメールの送信記録（新しい順）。
 *
 * 返すのは send_log の実物＝Gmail が受理した時点で書かれた記録。
 * 予約送信でも同じ経路（post-send）で書かれるので、「予約どおり送られたか」は
 * scheduled_at（予定）と sent_at（記録）を並べて見れば分かる。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prospect = getProspect(Number(id));
    if (!prospect) {
      return NextResponse.json({ error: "生成履歴が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({
      // 予定と記録を同じ応答で返す（画面側で突き合わせを組み立てなくて済む）
      scheduledAt: prospect.scheduled_at,
      sendStatus: prospect.send_status,
      logs: getSendEvidenceByProspect(prospect.id),
    });
  } catch (error) {
    console.error("[send-log]", error);
    return NextResponse.json({ error: "送信記録を取得できませんでした" }, { status: 500 });
  }
}
