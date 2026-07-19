import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getAttachment } from "@/lib/db";
import type { EmailAttachment } from "@/lib/gmail";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["txt", "text/plain"],
  ["csv", "text/csv"],
  ["zip", "application/zip"],
]);

export const ALLOWED_EXTENSION_LABEL = "PDF・Word・Excel・PowerPoint・画像・テキスト・CSV・ZIP";

export interface StoredFile {
  storedName: string;
  mimeType: string;
  sizeBytes: number;
}

function getAttachmentsDir(): string {
  const dataDir = process.env.DATABASE_DIR || path.join(process.cwd(), "data");
  const dir = path.join(dataDir, "attachments");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedFile(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(getExtension(filename));
}

export function resolveMimeType(filename: string, declared: string): string {
  return ALLOWED_EXTENSIONS.get(getExtension(filename)) ?? declared ?? "application/octet-stream";
}

/**
 * Stored names are generated, never derived from user input, so a crafted
 * filename cannot escape the attachments directory.
 */
export async function saveAttachmentFile(file: File): Promise<StoredFile> {
  const ext = getExtension(file.name);
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(getAttachmentsDir(), storedName), buffer);

  return {
    storedName,
    mimeType: resolveMimeType(file.name, file.type),
    sizeBytes: buffer.length,
  };
}

function resolveStoredPath(storedName: string): string {
  const dir = getAttachmentsDir();
  const resolved = path.resolve(dir, path.basename(storedName));
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("不正なファイルパスです");
  }
  return resolved;
}

export function readAttachmentFile(storedName: string): Buffer {
  return fs.readFileSync(resolveStoredPath(storedName));
}

export function attachmentFileExists(storedName: string): boolean {
  return fs.existsSync(resolveStoredPath(storedName));
}

export function deleteAttachmentFile(storedName: string): void {
  const filePath = resolveStoredPath(storedName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/** 添付を削除・差し替えたら呼ぶ。消し忘れると古い中身を送り続ける */
export function invalidateAttachmentCache(id?: number): void {
  if (id === undefined) attachmentCache.clear();
  else attachmentCache.delete(id);
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  attachment: EmailAttachment;
}

/**
 * 一括送信は宛先ごとに同じ添付を読み直すため、500件送ると同じファイルを
 * 500回ディスクから読むことになる。mtime とサイズが一致する間は使い回す。
 */
const attachmentCache = new Map<number, CacheEntry>();

function loadOne(id: number): EmailAttachment {
  const record = getAttachment(id);
  if (!record) {
    throw new Error(`添付資料が見つかりません（ID: ${id}）`);
  }
  if (!attachmentFileExists(record.stored_name)) {
    throw new Error(`添付資料の実体が見つかりません（${record.filename}）`);
  }

  const stat = fs.statSync(resolveStoredPath(record.stored_name));
  const cached = attachmentCache.get(id);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.attachment;
  }

  const attachment: EmailAttachment = {
    filename: record.filename,
    content: readAttachmentFile(record.stored_name),
    contentType: record.mime_type,
  };
  attachmentCache.set(id, { mtimeMs: stat.mtimeMs, size: stat.size, attachment });
  return attachment;
}

/**
 * Loads attachments for sending. Throws instead of silently dropping a file —
 * an email that quietly goes out without its 資料 is worse than a failed send.
 */
export function loadEmailAttachments(attachmentIds: number[]): EmailAttachment[] {
  if (attachmentIds.length === 0) return [];

  const loaded: EmailAttachment[] = [];
  let totalBytes = 0;

  for (const id of attachmentIds) {
    const attachment = loadOne(id);
    totalBytes += attachment.content.length;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      const limitMb = Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024);
      throw new Error(`添付の合計サイズが${limitMb}MBを超えています`);
    }
    loaded.push(attachment);
  }

  return loaded;
}
