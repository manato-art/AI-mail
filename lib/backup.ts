import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { vacuumInto } from "@/lib/db";

const MAX_BACKUPS = 7;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** ホットリロード・多重 register() でタイマーが積み重ならないようにする */
const SCHEDULE_FLAG = Symbol.for("sales-mail.backup-schedule");

interface ScheduleHolder {
  [SCHEDULE_FLAG]?: NodeJS.Timeout;
}

export function backupDatabase(): string {
  const dataDir = process.env.DATABASE_DIR || path.join(process.cwd(), "data");
  const backupDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDir, `sales-mail-${timestamp}.db`);

  // VACUUM INTO は出力先が既存だと失敗する。同日2回目は取り直しになる
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  vacuumInto(backupPath);

  if (!isBackupUsable(backupPath)) {
    fs.unlinkSync(backupPath);
    throw new Error("バックアップの検証に失敗しました（中身が空）");
  }

  pruneOldBackups(backupDir);

  return backupPath;
}

/**
 * 取ったバックアップが実際に読めるかを確認する。
 * 「バックアップがある」という誤った安心を作らないための検証。
 * ファイルサイズでは判定しない（空のDBでも4096バイトになり、今回の欠陥を見逃す）。
 */
function isBackupUsable(backupPath: string): boolean {
  try {
    const db = new Database(backupPath, { readonly: true });
    const row = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table'")
      .get() as { count: number };
    db.close();
    return row.count > 0;
  } catch {
    return false;
  }
}

function pruneOldBackups(backupDir: string): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("sales-mail-") && f.endsWith(".db"))
    .sort()
    .reverse();

  for (const file of files.slice(MAX_BACKUPS)) {
    fs.unlinkSync(path.join(backupDir, file));
  }
}

function runScheduledBackup(): void {
  try {
    backupDatabase();
  } catch (err) {
    // バックアップ失敗でアプリを落とさない。DB未作成の初回起動でも到達する
    console.error("scheduled backup failed:", err);
  }
}

/**
 * サーバ起動時に1回 + 以降24時間ごとにバックアップする。
 * instrumentation.ts の register() から呼ばれる。
 */
export function startBackupSchedule(): void {
  const holder = globalThis as ScheduleHolder;
  if (holder[SCHEDULE_FLAG]) return;

  runScheduledBackup();

  const timer = setInterval(runScheduledBackup, BACKUP_INTERVAL_MS);
  // 常駐タイマーがプロセス終了を妨げないようにする
  timer.unref?.();
  holder[SCHEDULE_FLAG] = timer;
}
