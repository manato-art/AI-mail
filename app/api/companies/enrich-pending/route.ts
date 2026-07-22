import { NextResponse } from "next/server";
import {
  countCompaniesPendingEnrichment,
  tryAcquireJobLock,
  releaseJobLock,
} from "@/lib/db";
import { runEnrichmentBatch } from "@/lib/enrichment";
import { COLLECTION_JOB_LOCK_KEY } from "@/lib/collection-job";

// 定期収集ジョブ・手動再調査と同じロックキーで相互排他（二重クロール・ロストアップデート防止）
const LOCK_KEY = COLLECTION_JOB_LOCK_KEY;
const LOCK_TTL_MINUTES = 60;
/** 1回の押下で調査する上限。ロックTTL内に収まる範囲に抑え、多い時は複数回に分ける */
const MAX_PER_PRESS = 100;

/**
 * 準備中（未調査）の企業をまとめて調査する。
 * 新規収集は行わず enrichment だけを走らせ、HP特定→クロール→連絡先メール抽出→相性スコアまで進める。
 * 1周に数分かかるため結果は待たずに 202 を返し、画面は一覧の更新で進捗を見る
 * （待つと Railway / リバースプロキシのタイムアウトで途中切断され「動いていない」ように見えるため）。
 */
export async function POST() {
  if (!tryAcquireJobLock(LOCK_KEY, LOCK_TTL_MINUTES)) {
    return NextResponse.json(
      { started: false, error: "別の収集・調査処理が実行中です。しばらく待ってから再試行してください" },
      { status: 409 }
    );
  }

  const pending = countCompaniesPendingEnrichment();
  if (pending === 0) {
    releaseJobLock(LOCK_KEY);
    return NextResponse.json({ started: false, pending: 0, message: "準備中の企業はありません" });
  }

  const queued = Math.min(pending, MAX_PER_PRESS);
  // 待たずに背景で走らせる。完了・失敗いずれでもロックは必ず解放する
  void runEnrichmentBatch(queued)
    .catch((error) => {
      console.error("enrich-pending failed:", error);
    })
    .finally(() => {
      releaseJobLock(LOCK_KEY);
    });

  return NextResponse.json({ started: true, pending, queued }, { status: 202 });
}
