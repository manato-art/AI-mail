import { NextResponse } from "next/server";
import { resetEnrichedWithoutEmail, tryAcquireJobLock, releaseJobLock } from "@/lib/db";
import { runEnrichmentBatch } from "@/lib/enrichment";

const LOCK_KEY = "lock:re-enrich";
const LOCK_TTL_MINUTES = 30;

/**
 * メールアドレスが取得できなかった企業を再調査キューに戻し、
 * 即座にエンリッチメントを1バッチ実行する。
 */
export async function POST() {
  if (!tryAcquireJobLock(LOCK_KEY, LOCK_TTL_MINUTES)) {
    return NextResponse.json(
      { error: "再調査が既に実行中です。しばらく待ってから再試行してください" },
      { status: 409 }
    );
  }

  try {
    const reset = resetEnrichedWithoutEmail();
    if (reset === 0) {
      return NextResponse.json({
        reset: 0,
        processed: 0,
        message: "メール未取得の企業はありません",
      });
    }

    const result = await runEnrichmentBatch(reset);
    return NextResponse.json({
      reset,
      processed: result.processed,
      failed: result.failed,
      excluded: result.excluded,
    });
  } finally {
    releaseJobLock(LOCK_KEY);
  }
}
