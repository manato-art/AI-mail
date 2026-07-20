import {
  getSetting,
  hasIntervalElapsed,
  isJobLocked,
  releaseJobLock,
  setSetting,
  tryAcquireJobLock,
} from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { runCollectionCycle, type CollectionCycleResult } from "@/lib/collection";
import { runEnrichmentBatch, type EnrichmentBatchResult } from "@/lib/enrichment";

/** 収集は1日1回で足りる。叩く回数を増やすほど検知・ブロックのリスクが上がる */
const RUN_INTERVAL_HOURS = 24;

/** スケジューラの見回り間隔。実際に走るかは前回実行時刻で決まる */
const TICK_INTERVAL_MS = 30 * 60 * 1000;

/** ロックのTTL。途中でプロセスが落ちても、この時間で自動的に外れる */
const LOCK_TTL_MINUTES = 90;

const LOCK_KEY = "collection_job_lock_until";
const LAST_RUN_KEY = "collection_job_last_run_at";

export type JobTrigger = "schedule" | "manual" | "cron";

export interface CollectionJobResult {
  ran: boolean;
  /** 実行しなかった理由。cron 側で「動いていない」と誤解しないよう必ず返す */
  skipReason?: string;
  collection?: CollectionCycleResult;
  enrichment?: EnrichmentBatchResult;
}

/**
 * 収集 → 裏処理（クロール・連絡先・相性スコア）を1回分走らせる。
 *
 * アプリ内スケジューラ・外部cron・画面の手動実行が同じ入口を使う。
 * 収集先DBはアプリが持つDBなので、どこから叩いても在庫は1箇所に溜まる。
 */
export async function runCollectionJob(trigger: JobTrigger): Promise<CollectionJobResult> {
  // 自動実行だけ間隔を見る。手動実行は人が意図して押しているので即座に走らせる
  if (trigger === "schedule" && !hasIntervalElapsed(LAST_RUN_KEY, RUN_INTERVAL_HOURS)) {
    return { ran: false, skipReason: "前回の実行から24時間が経過していません" };
  }

  if (!tryAcquireJobLock(LOCK_KEY, LOCK_TTL_MINUTES)) {
    return { ran: false, skipReason: "別の収集処理が実行中です" };
  }

  try {
    logActivity(`🚀 収集ジョブ開始（${trigger}）`);
    const collection = await runCollectionCycle();
    logActivity(
      `📦 収集フェーズ完了: ${collection.newCompanies}社を新規追加`,
      collection.newCompanies > 0 ? "success" : "info"
    );
    const enrichment = await runEnrichmentBatch();
    setSetting(LAST_RUN_KEY, new Date().toISOString().slice(0, 19).replace("T", " "));
    logActivity(`🏁 収集ジョブ完了`, "success");
    return { ran: true, collection, enrichment };
  } finally {
    releaseJobLock(LOCK_KEY);
  }
}

/**
 * 起動前に分かる範囲でスキップ理由を返す（読み取りのみ）。
 * 収集は数分かかるためHTTPは結果を待たずに返す。呼び出し側が
 * 「受け付けたのか、なぜ動かなかったのか」を即答できるようにするための関数。
 * 実際の排他は runCollectionJob 内の tryAcquireJobLock が担う。
 */
export function findJobBlockReason(trigger: JobTrigger): string | null {
  if (trigger === "schedule" && !hasIntervalElapsed(LAST_RUN_KEY, RUN_INTERVAL_HOURS)) {
    return "前回の実行から24時間が経過していません";
  }
  if (isJobLocked(LOCK_KEY)) {
    return "別の収集処理が実行中です";
  }
  return null;
}

export function getLastCollectionRunAt(): string | null {
  return getSetting(LAST_RUN_KEY) ?? null;
}

type ScheduleHolder = typeof globalThis & {
  __collectionSchedule?: NodeJS.Timeout;
};

async function tick(): Promise<void> {
  try {
    const result = await runCollectionJob("schedule");
    if (result.ran) {
      console.info(
        `collection job: ${result.collection?.newCompanies ?? 0} new companies, ` +
          `${result.enrichment?.processed ?? 0} enriched`
      );
    }
  } catch (error) {
    // スケジューラ自体は止めない。次の見回りで再試行する
    console.error("collection job failed:", error);
  }
}

/**
 * 常時収集のスケジューラ。instrumentation.ts の register() から呼ぶ。
 *
 * 前回実行時刻はDBに持っているので、再起動でタイマーが巻き戻っても
 * 1日1回より多く走ることはない。
 */
export function startCollectionSchedule(): void {
  const holder = globalThis as ScheduleHolder;
  if (holder.__collectionSchedule) return;

  const timer = setInterval(tick, TICK_INTERVAL_MS);
  timer.unref?.();
  holder.__collectionSchedule = timer;

  // 起動直後は他の初期化と競合させたくないので、少し置いてから1回目を見る
  const firstTick = setTimeout(tick, 60 * 1000);
  firstTick.unref?.();
}
