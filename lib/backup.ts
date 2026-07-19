import fs from "fs";
import path from "path";

const MAX_BACKUPS = 7;

export function backupDatabase(): string {
  const dataDir = process.env.DATABASE_DIR || path.join(process.cwd(), "data");
  const dbPath = path.join(dataDir, "sales-mail.db");

  if (!fs.existsSync(dbPath)) {
    throw new Error("Database file not found");
  }

  const backupDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDir, `sales-mail-${timestamp}.db`);

  fs.copyFileSync(dbPath, backupPath);

  pruneOldBackups(backupDir);

  return backupPath;
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
