import { NextRequest, NextResponse } from "next/server";
import {
  deleteCollectionSource,
  getCollectionSource,
  resumeCollectionSource,
  setCollectionSourceActive,
} from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sourceId = Number(id);
    if (!getCollectionSource(sourceId)) {
      return NextResponse.json({ error: "収集ソースが見つかりません" }, { status: 404 });
    }

    const body = await request.json();

    // 自動停止の解除。連続カウンタも戻さないと次の1回でまた止まる
    if (body?.action === "resume") {
      resumeCollectionSource(sourceId);
      return NextResponse.json({ source: getCollectionSource(sourceId) });
    }

    if (typeof body?.is_active === "boolean") {
      setCollectionSourceActive(sourceId, body.is_active);
      return NextResponse.json({ source: getCollectionSource(sourceId) });
    }

    return NextResponse.json({ error: "操作が指定されていません" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!deleteCollectionSource(Number(id))) {
      return NextResponse.json({ error: "収集ソースが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
