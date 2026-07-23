import { NextResponse } from "next/server";
import {
  countCompaniesForIntegrityCheck,
  tryAcquireJobLock,
  releaseJobLock,
} from "@/lib/db";
import { runIntegrityCheckBatch } from "@/lib/data-integrity";
import { COLLECTION_JOB_LOCK_KEY } from "@/lib/collection-job";

// 定期収集ジョブ・手動再調査・整合チェックはすべて同じロックキーで相互排他（二重クロール防止）
const LOCK_KEY = COLLECTION_JOB_LOCK_KEY;
const LOCK_TTL_MINUTES = 60;
/** 1回の押下で照合する上限。ロックTTL内に収まる範囲に抑え、多い時は複数回に分ける */
const MAX_PER_PRESS = 100;

/**
 * 調査済み・連絡先あり企業のHPを再クロールし、「登録社名がそのHPに現れるか」を照合する。
 * 現れない企業は別会社サイトの誤紐付けとみなし、連絡先を無効化して再調査キューへ戻す。
 * 1周に数分かかるため結果は待たずに 202 を返し、画面は一覧の更新で結果を見る
 * （待つと Railway / リバースプロキシのタイムアウトで途中切断されるため）。
 */
export async function POST() {
  if (!tryAcquireJobLock(LOCK_KEY, LOCK_TTL_MINUTES)) {
    return NextResponse.json(
      { started: false, error: "別の収集・調査処理が実行中です。しばらく待ってから再試行してください" },
      { status: 409 }
    );
  }

  const target = countCompaniesForIntegrityCheck();
  if (target === 0) {
    releaseJobLock(LOCK_KEY);
    return NextResponse.json({ started: false, target: 0, message: "整合チェックの対象企業はありません" });
  }

  const queued = Math.min(target, MAX_PER_PRESS);
  // 待たずに背景で走らせる。完了・失敗いずれでもロックは必ず解放する
  void runIntegrityCheckBatch(queued)
    .catch((error) => {
      console.error("reconcile failed:", error);
    })
    .finally(() => {
      releaseJobLock(LOCK_KEY);
    });

  return NextResponse.json({ started: true, target, queued }, { status: 202 });
}
