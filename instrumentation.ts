/**
 * サーバ起動時のフック。Node.js ランタイムでのみ実行される。
 * better-sqlite3 / fs を使うため edge ランタイムでは読み込まない。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startBackupSchedule } = await import("@/lib/backup");
  startBackupSchedule();

  // F1: 企業リストを在庫として持つための常時収集。
  // 外部cronからも同じ処理を叩けるが（POST /api/collection/run）、
  // アプリが24時間動いている環境ではこちらだけで足りる。
  if (process.env.COLLECTION_SCHEDULE_DISABLED !== "1") {
    const { startCollectionSchedule } = await import("@/lib/collection-job");
    startCollectionSchedule();
  }
}
