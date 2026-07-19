import { NextResponse } from "next/server";
import {
  getTemplate,
  getAttachment,
  getTemplateAttachments,
  setTemplateAttachments,
} from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getTemplate(Number(id))) {
    return NextResponse.json({ error: "テンプレートが見つかりません" }, { status: 404 });
  }
  return NextResponse.json(getTemplateAttachments(Number(id)));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templateId = Number(id);
  if (!getTemplate(templateId)) {
    return NextResponse.json({ error: "テンプレートが見つかりません" }, { status: 404 });
  }

  let data: { attachmentIds?: unknown };
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  if (!Array.isArray(data.attachmentIds)) {
    return NextResponse.json({ error: "attachmentIds は配列で指定してください" }, { status: 400 });
  }

  const ids = data.attachmentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const missing = ids.filter((attachmentId) => !getAttachment(attachmentId));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `存在しない資料が含まれています（ID: ${missing.join(", ")}）` },
      { status: 400 }
    );
  }

  return NextResponse.json(setTemplateAttachments(templateId, ids));
}
