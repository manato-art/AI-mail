import { NextResponse } from "next/server";
import { findJobBlockReason, runCollectionJob, type JobTrigger } from "@/lib/collection-job";

/**
 * 収集ジョブをHTTPから起動する共通処理。
 *
 * 1周に数分かかるため結果は待たずに返す。実行内容は collection_runs に残るので、
 * 画面はそちらを見る。待つと Railway / リバースプロキシのタイムアウトで
 * 途中切断され、「動いていない」ように見えてしまう。
 */
export function triggerCollectionJob(trigger: JobTrigger): NextResponse {
  const blockReason = findJobBlockReason(trigger);
  if (blockReason) {
    return NextResponse.json({ started: false, reason: blockReason });
  }

  void runCollectionJob(trigger).catch((error) => {
    console.error("collection job failed:", error);
  });

  return NextResponse.json({ started: true }, { status: 202 });
}
