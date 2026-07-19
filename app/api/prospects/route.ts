import { NextRequest, NextResponse } from "next/server";
import { getAllProspects, deleteAllProspects } from "@/lib/db";

/** 誤爆・外部からの叩きで全件消えないよう、明示的な合言葉を要求する */
const DELETE_CONFIRMATION = "DELETE_ALL_PROSPECTS";

export async function GET() {
  try {
    return NextResponse.json(getAllProspects());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let confirmation: unknown;
  try {
    const body = await request.json();
    confirmation = body?.confirm;
  } catch {
    confirmation = undefined;
  }

  if (confirmation !== DELETE_CONFIRMATION) {
    return NextResponse.json(
      { error: "確認キーが一致しないため削除を中止しました" },
      { status: 400 }
    );
  }

  try {
    deleteAllProspects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
