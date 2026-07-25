"use client";

import { Warning, WarningOctagon } from "@phosphor-icons/react";
import { BTN_SECONDARY } from "@/components/ui-kit";
import type { CollectionStatus } from "./types";

/**
 * 仕様書 F25: 在庫が切れかけていることに気づけるようにする。
 * 「営業が止まる原因の1位はリスト切れに気づかないこと」への対策。
 *
 * 4指標の数字そのものはページ側（在庫サマリ）が出す。ここは
 * 「気づき装置」＝自動停止／在庫僅少の警告と、失敗分のやり直しだけを持つ。
 * 表示条件 isLowStock && !hasBlockedSource の排他は現行のまま（同時に2枚出さない）。
 */
export function InventoryPanel({
  status,
  onRetryFailed,
}: {
  status: CollectionStatus;
  onRetryFailed: () => void;
}) {
  const hasAnything =
    status.hasBlockedSource || status.isLowStock || status.failedEnrichment > 0;
  if (!hasAnything) return null;

  return (
    <section className="flex flex-col gap-3">
      {status.hasBlockedSource && (
        <div className="flex gap-3 rounded-xl border border-(--color-danger) bg-(--color-danger-light) p-4">
          <WarningOctagon size={20} className="mt-0.5 shrink-0 text-(--color-danger)" />
          <div className="text-[13px] leading-relaxed">
            <p className="font-semibold text-(--color-danger)">収集を自動停止しました</p>
            <p className="mt-1 text-(--color-foreground)">
              検索結果が取得できない状態が続いています。アクセスを制限されたか、検索元のページ構造が
              変わった可能性があります。原因を確認するまで、このキーワードの収集は再開されません。
            </p>
          </div>
        </div>
      )}

      {status.isLowStock && !status.hasBlockedSource && (
        <div className="flex gap-3 rounded-xl border border-(--color-warning) bg-(--color-warning-light) p-4">
          <Warning size={20} className="mt-0.5 shrink-0 text-(--color-warning)" />
          <div className="text-[13px] leading-relaxed">
            <p className="font-semibold text-(--color-warning)">送れる企業が残りわずかです</p>
            <p className="mt-1 text-(--color-foreground)">
              このペースだと約{status.daysRemaining}日分しかありません。キーワードを追加するか、
              企業リストを取り込んでください。
            </p>
          </div>
        </div>
      )}

      {status.failedEnrichment > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-(--color-card) p-4">
          <p className="text-[13px] text-(--color-muted)">
            検索が一時的に不調だっただけの場合もあります。まとめて調べ直せます。
          </p>
          <button type="button" onClick={onRetryFailed} className={`${BTN_SECONDARY} shrink-0`}>
            {status.failedEnrichment}社をもう一度調べる
          </button>
        </div>
      )}
    </section>
  );
}
