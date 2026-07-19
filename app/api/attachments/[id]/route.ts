import { NextResponse } from "next/server";
import { getAttachment, deleteAttachment } from "@/lib/db";
import {
  attachmentFileExists,
  deleteAttachmentFile,
  invalidateAttachmentCache,
  readAttachmentFile,
} from "@/lib/attachments";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = getAttachment(Number(id));
  if (!attachment) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  if (!attachmentFileExists(attachment.stored_name)) {
    return NextResponse.json({ error: "ファイルの実体が見つかりません" }, { status: 404 });
  }

  const buffer = readAttachmentFile(attachment.stored_name);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Content-Length": String(attachment.size_bytes),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = getAttachment(Number(id));
  if (!attachment) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }

  // Remove the row first: an orphaned file is recoverable, a row pointing at a
  // deleted file breaks every send that references it.
  deleteAttachment(attachment.id);
  invalidateAttachmentCache(attachment.id);
  try {
    deleteAttachmentFile(attachment.stored_name);
  } catch {
    return NextResponse.json({ ok: true, warning: "ファイル実体の削除に失敗しました" });
  }

  return NextResponse.json({ ok: true });
}
