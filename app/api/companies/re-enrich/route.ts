import { NextResponse } from "next/server";
import { resetEnrichedWithoutEmail } from "@/lib/db";
import { runEnrichmentBatch } from "@/lib/enrichment";

/**
 * メールアドレスが取得できなかった企業を再調査キューに戻し、
 * 即座にエンリッチメントを1バッチ実行する。
 */
export async function POST() {
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
}
