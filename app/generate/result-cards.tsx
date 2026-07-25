"use client";

import { Check, Warning } from "@phosphor-icons/react";
import type { AnalysisResult, Prospect } from "@/lib/types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "@/components/ui-kit";
import { PROGRESS_STEPS, type Status } from "./types";

/** 文字だけの控えめなボタン（キャンセル等） */
const BTN_QUIET =
  "inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-medium text-(--color-muted) transition-colors motion-reduce:transition-none hover:text-(--color-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)";

/** 1社生成の疑似進捗。実処理の進捗ではなく「待ち時間の見える化」（IA-DESIGN §5-7） */
export function ProgressCard({ status }: { status: Status }) {
  const currentIndex = PROGRESS_STEPS.findIndex((step) => step.key === status);
  const pctMap: Record<string, number> = { crawling: 15, analyzing: 50, generating: 85 };
  const pct = pctMap[status] ?? 0;

  return (
    <div className={`${CARD} animate-fade-in p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium">
          {PROGRESS_STEPS[currentIndex]?.label ?? "処理中"}
        </p>
        <span className="text-[13px] tabular-nums text-(--color-muted)">{pct}%</span>
      </div>
      <div className="mb-5 h-2.5 w-full overflow-hidden rounded-full bg-(--color-card-hover)">
        <div
          className="h-full rounded-full bg-(--color-primary) transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-4">
        {PROGRESS_STEPS.map((step, index) => {
          const isDone = currentIndex > index;
          const isCurrent = currentIndex === index;
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className="mt-0.5">
                {isDone ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-(--color-success-light)">
                    <Check size={16} weight="bold" className="text-(--color-success)" />
                  </div>
                ) : isCurrent ? (
                  <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-(--color-primary-light)">
                    <div className="absolute inset-0 animate-pulse-ring rounded-full bg-(--color-primary) opacity-20" />
                    <div className="h-2.5 w-2.5 rounded-full bg-(--color-primary)" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-(--color-border)" />
                )}
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${
                    isCurrent ? "text-(--color-foreground)" : "text-(--color-muted)"
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="mt-0.5 text-[13px] text-(--color-muted)">{step.sub}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 重複（生成済み）。既存を見る／それでも新規作成／やめる の3択は変えない */
export function DuplicateDialog({
  prospect,
  onView,
  onForceNew,
  onCancel,
}: {
  prospect: Prospect;
  onView: () => void;
  onForceNew: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="animate-fade-in rounded-xl border border-(--color-warning) bg-(--color-warning-light) p-5">
      <div className="flex gap-3">
        <Warning className="mt-0.5 shrink-0 text-(--color-warning)" size={24} weight="fill" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-(--color-foreground)">
            この企業は生成済みです
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-(--color-muted)">
            {prospect.company_name || prospect.domain}{" "}
            宛のメールは既に作成されています。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onView} className={BTN_PRIMARY}>
              過去の結果を見る
            </button>
            <button type="button" onClick={onForceNew} className={BTN_SECONDARY}>
              新規作成
            </button>
            <button type="button" onClick={onCancel} className={BTN_QUIET}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 相性が低い。強行は赤ボタン（進む操作でも「勧めない」と分かる見た目にする） */
export function LowCompatDialog({
  analysis,
  onForce,
  onCancel,
}: {
  analysis: AnalysisResult;
  onForce: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="animate-fade-in rounded-xl border border-(--color-danger) bg-(--color-danger-light) p-5">
      <div className="flex gap-3">
        <Warning className="mt-0.5 shrink-0 text-(--color-danger)" size={24} weight="fill" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-(--color-foreground)">
            相性が低い可能性があります
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-(--color-muted)">
            {analysis.compatibility.reason}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onForce}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-(--color-danger) px-4 text-sm font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-(--color-danger-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-danger)"
            >
              それでも生成する
            </button>
            <button type="button" onClick={onCancel} className={BTN_QUIET}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** エラーは握り潰さず必ず画面に出す（白画面にしない） */
export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="animate-fade-in rounded-xl border border-(--color-danger) bg-(--color-danger-light) p-5">
      <div className="flex gap-3">
        <Warning className="mt-0.5 shrink-0 text-(--color-danger)" size={24} weight="fill" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-(--color-foreground)">エラーが発生しました</h2>
          <p className="mt-1 text-sm leading-relaxed text-(--color-muted)">{message}</p>
          <button type="button" onClick={onRetry} className={`${BTN_PRIMARY} mt-4`}>
            再試行
          </button>
        </div>
      </div>
    </div>
  );
}
