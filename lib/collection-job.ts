import {
  countCompaniesPendingEnrichment,
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
import { runScheduledSendBatch } from "@/lib/send-scheduler";

/** 収集は1日1回で足りる。叩く回数を増やすほど検知・ブロックのリスクが上がる */
const RUN_INTERVAL_HOURS = 24;

/** スケジューラの見回り間隔。実際に走るかは前回実行時刻で決まる */
const TICK_INTERVAL_MS = 30 * 60 * 1000;

/** ロックのTTL。途中でプロセスが落ちても、この時間で自動的に外れる */
const LOCK_TTL_MINUTES = 90;

/**
 * 準備中バックログの自動消化の間隔とバッチ。
 * enrichment は「相手企業自身のHP」を1社ずつ間隔を空けて見る処理で、収集元(媒体)の
 * 検知リスクとは無関係。そのため収集の24hとは切り離し、準備中が溜まっている時だけ
 * 数分おきに少しずつ捌いて「集めたのに準備中で止まる」を自動で解消する。
 */
const ENRICH_TICK_INTERVAL_MS = 5 * 60 * 1000;
const ENRICH_TICK_BATCH = 20;
const ENRICH_LOCK_TTL_MINUTES = 30;

/** 予約送信の見回り間隔。予約時刻の精度に効くので短め（1分） */
const SCHEDULE_TICK_INTERVAL_MS = 60 * 1000;

/**
 * 収集ジョブ + 裏処理(enrichment)の共有ロックキー。
 * 手動再調査(app/api/companies/re-enrich)もこのキーで排他し、
 * 定期ジョブと手動再調査が同時に runEnrichmentBatch を走らせて
 * 同一企業を二重クロール・AI二重課金・分析結果のロストアップデートを起こすのを防ぐ。
 */
export const COLLECTION_JOB_LOCK_KEY = "collection_job_lock_until";
const LOCK_KEY = COLLECTION_JOB_LOCK_KEY;
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
  __enrichSchedule?: NodeJS.Timeout;
  __scheduleSendSchedule?: NodeJS.Timeout;
};

// 予約送信ティックの再入防止（1バッチが1分を超えても多重起動しない）
let scheduledSendRunning = false;

/**
 * 予定時刻が到来した予約メールを送る見回り。収集ロックとは独立（送信は別リソース）。
 * per-email のクレームと送信ガードで安全性は担保される。
 */
async function scheduledSendTick(): Promise<void> {
  if (scheduledSendRunning) return;
  scheduledSendRunning = true;
  try {
    const result = await runScheduledSendBatch();
    if (result.sent > 0 || result.failed > 0) {
      console.info(`scheduled send: ${result.sent} sent / ${result.failed} failed`);
    }
  } catch (error) {
    console.error("scheduled send tick failed:", error);
  } finally {
    scheduledSendRunning = false;
  }
}

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
 * 準備中（未調査）の企業を自動で少しずつ消化する見回り。
 * 収集の24hゲートとは独立して動くが、準備中が無い時・別処理が走っている時は何もしない。
 * これにより「収集したのに準備中で止まる」状態が手動ボタンを押さずとも自動で解けていく。
 */
async function enrichTick(): Promise<void> {
  try {
    // 収集ジョブ・手動調査が動作中なら触らない（無駄なロック取得で他をブロックしない）
    if (isJobLocked(LOCK_KEY)) return;
    if (countCompaniesPendingEnrichment() === 0) return;
    if (!tryAcquireJobLock(LOCK_KEY, ENRICH_LOCK_TTL_MINUTES)) return;
    try {
      const result = await runEnrichmentBatch(ENRICH_TICK_BATCH);
      if (result.processed > 0 || result.failed > 0 || result.excluded > 0) {
        console.info(
          `enrich tick: ${result.processed} enriched / ${result.failed} failed / ${result.excluded} excluded`
        );
      }
    } finally {
      releaseJobLock(LOCK_KEY);
    }
  } catch (error) {
    // 見回り自体は止めない。次のtickで再試行する
    console.error("enrich tick failed:", error);
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

  // 準備中バックログを自動消化する見回り（収集の24hとは独立。詰まっている時だけ動く）
  const enrichTimer = setInterval(enrichTick, ENRICH_TICK_INTERVAL_MS);
  enrichTimer.unref?.();
  holder.__enrichSchedule = enrichTimer;

  // 予約送信の見回り（1分ごと。予約時刻が来たものだけ送る）
  const scheduleSendTimer = setInterval(scheduledSendTick, SCHEDULE_TICK_INTERVAL_MS);
  scheduleSendTimer.unref?.();
  holder.__scheduleSendSchedule = scheduleSendTimer;

  // 起動直後は他の初期化と競合させたくないので、少し置いてから1回目を見る
  const firstTick = setTimeout(tick, 60 * 1000);
  firstTick.unref?.();
  // 起動直後にバックログがあれば早めに1回消化を始める
  const firstEnrich = setTimeout(enrichTick, 90 * 1000);
  firstEnrich.unref?.();
  // 起動直後に期日到来済みの予約があれば早めに送る
  const firstScheduleSend = setTimeout(scheduledSendTick, 45 * 1000);
  firstScheduleSend.unref?.();
}
