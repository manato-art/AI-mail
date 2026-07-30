import { NextResponse } from "next/server";
import { getCollectionDiagnostics } from "@/lib/db";
import { getLastCollectionRunAt } from "@/lib/collection-job";

/**
 * 収集が本当に回っているかを数字で返す（読み取り専用）。
 *
 * 収集元が増えると1周期で全件に順番が回らないため、「動いていない」のか
 * 「順番が来ていないだけ」なのかを画面で見分けられるようにする。
 */
export function GET() {
  return NextResponse.json({
    ...getCollectionDiagnostics(),
    lastJobFinishedAt: getLastCollectionRunAt(),
  });
}
