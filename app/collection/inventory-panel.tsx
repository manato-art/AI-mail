"use client";

import { Warning, WarningOctagon } from "@phosphor-icons/react";
import type { CollectionStatus } from "./types";

function Metric({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "danger" | "warning";
}) {
  const valueColor =
    tone === "danger"
      ? "text-(--color-danger)"
      : tone === "warning"
        ? "text-(--color-warning)"
        : "text-(--color-foreground)";

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-card) p-4">
      <p className="text-[12px] text-(--color-muted)">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-(--color-muted)">{hint}</p>}
    </div>
  );
}

/**
 * 仕様書 F25: 在庫が切れかけていることに気づけるようにする。
 * 「営業が止まる原因の1位はリスト切れに気づかないこと」への対策。
 */
export function InventoryPanel({
  status,
  onRetryFailed,
}: {
  status: CollectionStatus;
  onRetryFailed: () => void;
}) {
  const paceText = status.isPaceEstimated
    ? "送信実績が無いため仮に1日10件で試算"
    : `直近7日の実績 1日あたり約${status.dailyPace.toFixed(1)}件`;

  return (
    <section className="flex flex-col gap-3">
      {status.hasBlockedSource && (
        <div className="flex gap-3 rounded-xl border border-(--color-danger) bg-(--color-danger-light) p-4">
          <WarningOctagon size={20} className="mt-0.5 shrink-0 text-(--color-danger)" />
          <div className="text-[13px]">
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
          <div className="text-[13px]">
            <p className="font-semibold text-(--color-warning)">送れる企業が残りわずかです</p>
            <p className="mt-1 text-(--color-foreground)">
              このペースだと約{status.daysRemaining}日分しかありません。キーワードを追加するか、
              企業リストを取り込んでください。
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="すぐ送れる宛先"
          value={`${status.readyCount}件`}
          hint="送信済み・送信しないリストを除いた実数"
          tone={status.isLowStock ? "warning" : "normal"}
        />
        <Metric
          label="残り日数の目安"
          value={`約${status.daysRemaining}日`}
          hint={paceText}
          tone={status.isLowStock ? "warning" : "normal"}
        />
        <Metric
          label="準備中"
          value={`${status.pendingEnrichment}社`}
          hint="HPを調べて連絡先を集めている途中"
        />
        <Metric
          label="調査できず"
          value={`${status.failedEnrichment}社`}
          hint="公式サイトが見つからない等"
          tone={status.failedEnrichment > 0 ? "warning" : "normal"}
        />
      </div>

      {status.failedEnrichment > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-(--color-card) p-4">
          <p className="text-[13px] text-(--color-muted)">
            検索が一時的に不調だっただけの場合もあります。まとめて調べ直せます。
          </p>
          <button
            type="button"
            onClick={onRetryFailed}
            className="h-9 shrink-0 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium transition-colors hover:bg-(--color-card-hover) cursor-pointer"
          >
            {status.failedEnrichment}社をもう一度調べる
          </button>
        </div>
      )}
    </section>
  );
}
