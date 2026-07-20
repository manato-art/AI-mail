/** リアルタイム活動ログ。enrichment/crawl の進捗をメモリに保持し、UIからポーリングで表示する */

export interface ActivityEntry {
  id: number;
  time: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
}

const MAX_ENTRIES = 200;
let nextId = 1;
const buffer: ActivityEntry[] = [];

function now(): string {
  return new Date().toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function logActivity(message: string, type: ActivityEntry["type"] = "info"): void {
  const entry: ActivityEntry = { id: nextId++, time: now(), message, type };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function getRecentActivity(afterId = 0): ActivityEntry[] {
  if (afterId === 0) return buffer.slice(-50);
  return buffer.filter((e) => e.id > afterId);
}

export function clearActivity(): void {
  buffer.length = 0;
}
