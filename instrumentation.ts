/**
 * サーバ起動時のフック。Node.js ランタイムでのみ実行される。
 * better-sqlite3 / fs を使うため edge ランタイムでは読み込まない。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startBackupSchedule } = await import("@/lib/backup");
  startBackupSchedule();
}
