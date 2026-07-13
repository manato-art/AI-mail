import { NextResponse } from "next/server";
import { getAllProspects, deleteAllProspects } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(getAllProspects());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    deleteAllProspects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
