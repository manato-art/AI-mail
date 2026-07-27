import { NextResponse } from "next/server";
import {
  countCompaniesPendingEnrichment,
  releaseJobLock,
  resetFailedEnrichments,
  tryAcquireJobLock,
} from "@/lib/db";
import { resumeEnrichment, runEnrichmentBatch } from "@/lib/enrichment";
import { COLLECTION_JOB_LOCK_KEY } from "@/lib/collection-job";

// 定期収集ジョブ・手動再調査と同じロックキーで相互排他（二重クロール・ロストアップデート防止）
const LOCK_KEY = COLLECTION_JOB_LOCK_KEY;
const LOCK_TTL_MINUTES = 60;
/** 1回の押下で調査する上限。ロックTTL内に収まる範囲に抑え、多い時は複数回に分ける */
const MAX_PER_PRESS = 100;

/**
 * 「調査できず」の企業をまとめてやり直す（企業一覧の failed タブの導線）。
 *
 * 従来は「pending に戻すだけのボタン」と「調査を開始するボタン」が別ページにあり、
 * 2ページ2ステップを知らないと失敗した企業が詰まったままに見えていた。
 * ここでは 停止解除 → pending へ戻す → 調査を開始 までを1回で行う。
 * 停止解除（enrichment_paused_until のリセット）は人が明示的に押したときだけ行う。
 */
export async function POST() {
  if (!tryAcquireJobLock(LOCK_KEY, LOCK_TTL_MINUTES)) {
    return NextResponse.json(
      { started: false, error: "別の収集・調査処理が実行中です。しばらく待ってから再試行してください" },
      { status: 409 }
    );
  }

  // 基盤障害で自動見回りを止めていた場合の手動解除。人の意思で再開する
  resumeEnrichment();
  const reset = resetFailedEnrichments();
  const pending = countCompaniesPendingEnrichment();

  if (pending === 0) {
    releaseJobLock(LOCK_KEY);
    return NextResponse.json({ started: false, reset, pending: 0, message: "やり直す企業はありません" });
  }

  const queued = Math.min(pending, MAX_PER_PRESS);
  // 1周に数分かかるので待たずに背景で走らせる。完了・失敗いずれでもロックは必ず解放する
  void runEnrichmentBatch(queued)
    .catch((error) => {
      console.error("retry-failed enrichment failed:", error);
    })
    .finally(() => {
      releaseJobLock(LOCK_KEY);
    });

  return NextResponse.json({ started: true, reset, pending, queued }, { status: 202 });
}
