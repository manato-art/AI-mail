import { NextRequest, NextResponse } from "next/server";
import { getAllAttachments, createAttachment } from "@/lib/db";
import {
  ALLOWED_EXTENSION_LABEL,
  MAX_ATTACHMENT_BYTES,
  isAllowedFile,
  saveAttachmentFile,
} from "@/lib/attachments";

export function GET() {
  return NextResponse.json(getAllAttachments());
}

export async function POST(request: NextRequest) {
  let file: FormDataEntryValue | null;
  try {
    const formData = await request.formData();
    file = formData.get("file");
  } catch {
    return NextResponse.json({ error: "ファイルの受け取りに失敗しました" }, { status: 400 });
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "空のファイルは登録できません" }, { status: 400 });
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    const limitMb = Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024);
    return NextResponse.json(
      { error: `ファイルサイズは${limitMb}MB以下にしてください` },
      { status: 400 }
    );
  }

  if (!isAllowedFile(file.name)) {
    return NextResponse.json(
      { error: `${ALLOWED_EXTENSION_LABEL}のみ登録できます` },
      { status: 400 }
    );
  }

  try {
    const stored = await saveAttachmentFile(file);
    const attachment = createAttachment({
      filename: file.name,
      stored_name: stored.storedName,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ファイルの保存に失敗しました" }, { status: 500 });
  }
}
