/**
 * 収集ロックの自己回復の検証。
 * 前回プロセスがハング/クラッシュしてロックを握ったまま残しても、起動(startCollectionSchedule)で
 * 解放され、「収集を実行中」が張り付いて次の収集が始まらない状態が回復することを確認する。
 */
import { tryAcquireJobLock, isJobLocked } from "@/lib/db";
import { startCollectionSchedule, COLLECTION_JOB_LOCK_KEY } from "@/lib/collection-job";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// 前回プロセスが残した「実行中」ロックを再現
tryAcquireJobLock(COLLECTION_JOB_LOCK_KEY, 90);
check("前提: ロックが握られている（収集を実行中の状態）", isJobLocked(COLLECTION_JOB_LOCK_KEY) === true);

// 起動処理
startCollectionSchedule();

check("起動で stale ロックが解放される（張り付きが回復）", isJobLocked(COLLECTION_JOB_LOCK_KEY) === false);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
