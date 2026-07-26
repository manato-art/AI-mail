"use client";

import { useEffect, useRef } from "react";
import { MagicWand, PaperPlaneTilt, SpinnerGap, X } from "@phosphor-icons/react";

/**
 * 画面下に貼り付く送信バー。hasGenerated で二段に切り替わる:
 *   未生成 = 「選択したN件を生成」／生成後 = 予約日時＋「選択したN件を送信/予約」。
 * この順序（生成してから送信）は安全弁#5そのものなので変えない。
 *
 * 左の padding は左サイドバーの幅ぶん空ける（md:pl-16 xl:pl-60）。
 * これを忘れるとボタンがサイドバーの下に潜って押せなくなる。
 *
 * 実高さは内容量（折返し等）で変わるため ResizeObserver で計測し、
 * page 側に伝えて本文のラッパー padding に反映してもらう（下に固定されたこのバーが
 * ページ内容を覆い隠さないようにするため）。
 */
interface SendFooterProps {
  checkedCount: number;
  totalCount: number;
  hasGenerated: boolean;
  allowWarnings: boolean;
  setAllowWarnings: (value: boolean) => void;
  isSending: boolean;
  isGenerating: boolean;
  hasContent: boolean;
  senderSelected: boolean;
  generateProgress: { done: number; total: number };
  bulkScheduledAt: string;
  setBulkScheduledAt: (value: string) => void;
  onCancelSending: () => void;
  onCancelGenerating: () => void;
  onGenerate: () => void;
  onSend: () => void;
  /** このバーの実高さ（px）が変わるたびに呼ばれる。page 側で paddingBottom に使う */
  onHeightChange?: (height: number) => void;
}

export function SendFooter({
  checkedCount,
  totalCount,
  hasGenerated,
  allowWarnings,
  setAllowWarnings,
  isSending,
  isGenerating,
  hasContent,
  senderSelected,
  generateProgress,
  bulkScheduledAt,
  setBulkScheduledAt,
  onCancelSending,
  onCancelGenerating,
  onGenerate,
  onSend,
  onHeightChange,
}: SendFooterProps) {
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = footerRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <div ref={footerRef} className="fixed inset-x-0 bottom-0 z-20 border-t border-(--color-border) bg-(--color-card)/95 backdrop-blur-sm md:pl-16 xl:pl-60">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="text-[13px] text-(--color-muted)">
            <span className="text-lg font-bold text-(--color-foreground)">{checkedCount}</span> / {totalCount} 件選択中
          </p>
          {hasGenerated ? (
            <>
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-[13px] text-(--color-muted)">
                <input
                  type="checkbox"
                  checked={allowWarnings}
                  onChange={(e) => setAllowWarnings(e.target.checked)}
                  disabled={isSending}
                  className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                />
                要確認の指摘があっても送信する
              </label>
              <p className="mt-0.5 max-w-[52ch] text-[12px] leading-relaxed text-(--color-muted)">
                会社ごとの内容になっていない可能性のある宛先があります。内容を確認してからチェックしてください
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-[12px] leading-relaxed text-(--color-muted)">
              生成すると送信ボタンが現れます
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(isSending || isGenerating) && (
            <button
              type="button"
              onClick={isSending ? onCancelSending : onCancelGenerating}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-danger)/40 px-4 text-sm font-semibold text-(--color-danger-text) transition-colors hover:bg-(--color-danger-light)"
            >
              <X size={15} weight="bold" />
              中断
            </button>
          )}
          {!hasGenerated ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={!hasContent || !senderSelected || checkedCount === 0 || isGenerating}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  生成中... ({generateProgress.done}/{generateProgress.total})
                </>
              ) : (
                <>
                  <MagicWand size={16} weight="fill" />
                  {`選択した${checkedCount}件を生成`}
                </>
              )}
            </button>
          ) : (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-(--color-muted)">
                <span className="whitespace-nowrap">予約（任意）</span>
                <input
                  type="datetime-local"
                  value={bulkScheduledAt}
                  onChange={(e) => setBulkScheduledAt(e.target.value)}
                  disabled={isSending}
                  className="h-11 rounded-lg border border-(--color-border) bg-(--color-card) px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 disabled:opacity-50"
                />
                {bulkScheduledAt && (
                  <button type="button" onClick={() => setBulkScheduledAt("")} className="cursor-pointer text-(--color-muted) hover:text-(--color-danger-text)" aria-label="予約日時をクリア">
                    <X size={14} />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={onSend}
                disabled={!senderSelected || checkedCount === 0 || isSending}
                className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSending ? (
                  <SpinnerGap size={16} className="animate-spin" />
                ) : (
                  <PaperPlaneTilt size={16} weight="fill" />
                )}
                {isSending
                  ? "処理中..."
                  : bulkScheduledAt
                    ? `選択した${checkedCount}件を予約`
                    : `選択した${checkedCount}件を送信`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
