import { NextResponse } from "next/server";
import { getAllCollectionSources, getInventoryStats, isJobLocked } from "@/lib/db";
import { getLastCollectionRunAt } from "@/lib/collection-job";

const LOCK_KEY = "collection_job_lock_until";

/** 仕様書 F25: 残りがこの日数を切ったら警告する */
const LOW_STOCK_DAYS = 3;

/** 送信実績がまだ無い時に残日数を出すための仮ペース（1日あたり） */
const ASSUMED_DAILY_PACE = 10;

export async function GET() {
  const stats = getInventoryStats();
  const sources = getAllCollectionSources();

  // 送信実績が無いうちは実ペースが0になり、残日数が無限大になってしまう。
  // 枯渇警告を出さないより、仮のペースで見積もる方が事故に気づける
  const pace = stats.dailyPace > 0 ? stats.dailyPace : ASSUMED_DAILY_PACE;
  const daysRemaining = Math.floor(stats.readyCount / pace);

  const pausedSources = sources
    .filter((s) => s.paused_kind !== "")
    .map((s) => ({
      id: s.id,
      keyword: s.keyword,
      kind: s.paused_kind,
      reason: s.paused_reason,
    }));

  // ブロック疑いは障害、枯渇はキーワード追加の合図。同じ扱いにしない
  const blockedSources = pausedSources.filter((s) => s.kind === "blocked");

  return NextResponse.json({
    ...stats,
    daysRemaining,
    isPaceEstimated: stats.dailyPace === 0,
    isLowStock: daysRemaining < LOW_STOCK_DAYS,
    lowStockThresholdDays: LOW_STOCK_DAYS,
    activeSources: sources.filter((s) => s.is_active === 1 && s.paused_kind === "").length,
    pausedSources,
    hasBlockedSource: blockedSources.length > 0,
    lastRunAt: getLastCollectionRunAt(),
    isRunning: isJobLocked(LOCK_KEY),
  });
}
