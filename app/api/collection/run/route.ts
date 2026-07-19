import { triggerCollectionJob } from "@/lib/collection-trigger";

/**
 * 画面からの手動実行。
 * 全APIと同じくパスワード保護（proxy.ts）の内側にある。
 * 外部cronから叩く口は /api/collection/cron（トークン認証）。
 */
export async function POST() {
  return triggerCollectionJob("manual");
}
