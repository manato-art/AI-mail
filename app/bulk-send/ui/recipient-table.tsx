"use client";

import { Fragment, useRef, useState } from "react";
import {
  Buildings,
  Check,
  ClockCounterClockwise,
  Eye,
  Plus,
  SpinnerGap,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import type { Recipient, RowStatus } from "../shared";

/**
 * 宛先リスト（①だれに送る）の表示部品。
 * 状態と処理は page.tsx が持ち、ここは受け取った値を描くだけ。
 * hover 300ms のインラインプレビューだけはこの表の中で完結するのでここに置く。
 */
interface RecipientTableProps {
  recipients: Recipient[];
  allChecked: boolean;
  rowStatus: Record<string, RowStatus>;
  hasContent: boolean;
  buildEmail: (r: Recipient) => { subject: string; body: string; unresolved: string[] };
  onToggleAll: (checked: boolean) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, field: "company" | "person" | "email", value: string) => void;
  onDelete: (id: string) => void;
  onPreviewRow: (id: string) => void;
  onAddOne: () => void;
  onOpenImport: () => void;
  onOpenHistory: () => void;
  onOpenCompanies: () => void;
  /** 親（①のセクション枠）の中に直に置くとき＝自前の枠線を出さない */
  flush?: boolean;
}

export function RecipientTable({
  recipients,
  allChecked,
  rowStatus,
  hasContent,
  buildEmail,
  onToggleAll,
  onToggle,
  onUpdate,
  onDelete,
  onPreviewRow,
  onAddOne,
  onOpenImport,
  onOpenHistory,
  onOpenCompanies,
  flush = false,
}: RecipientTableProps) {
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className={flush ? "overflow-hidden" : "overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-4 py-3 md:px-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5"/><circle cx="11.5" cy="5.5" r="2"/><path d="M14.5 14c0-2.2-1.2-3.5-3-3.8"/></svg>
          宛先リスト
          {recipients.length > 0 && (
            <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-(--color-primary-light) px-1.5 text-[11px] font-bold text-(--color-primary)">
              {recipients.length}
            </span>
          )}
        </h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onToggleAll(true)}
            className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-3 text-xs font-medium transition-colors ${allChecked ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)" : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"}`}
          >
            <Check size={12} weight="bold" />
            全選択
          </button>
          <button
            type="button"
            onClick={() => onToggleAll(false)}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-(--color-border) px-3 text-xs font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
          >
            全解除
          </button>
        </div>
      </div>

      {recipients.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-(--color-border) bg-gray-50 text-left dark:bg-slate-700/50">
                <th className="w-[40px] px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => onToggleAll(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                  />
                </th>
                <th className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">#</th>
                <th className="min-w-[160px] px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">企業名</th>
                <th className="min-w-[120px] px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">担当者名</th>
                <th className="min-w-[200px] px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">メールアドレス</th>
                <th className="w-[44px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">状態</th>
                <th className="w-[40px] px-2 py-2.5" />
                <th className="w-[36px] px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {recipients.map((r, i) => (
                <Fragment key={r.id}>
                <tr
                  className={`relative border-b border-(--color-border) last:border-0 transition-colors ${r.checked ? "bg-(--color-primary-light)/30" : "hover:bg-(--color-card-hover)"} ${rowStatus[r.id]?.state === "sent" ? "opacity-50" : ""}`}
                  onMouseEnter={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = setTimeout(() => setHoveredRowId(r.id), 300);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                    setHoveredRowId(null);
                  }}
                >
                  <td className="px-3 text-center">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => onToggle(r.id)}
                      className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                    />
                  </td>
                  <td className="px-2 text-center text-xs tabular-nums text-(--color-muted)">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={r.company}
                      onChange={(e) => onUpdate(r.id, "company", e.target.value)}
                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] transition-colors hover:border-(--color-border) hover:bg-(--color-card) focus:border-(--color-primary) focus:bg-(--color-card) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                      placeholder="株式会社○○"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={r.person}
                      onChange={(e) => onUpdate(r.id, "person", e.target.value)}
                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] transition-colors hover:border-(--color-border) hover:bg-(--color-card) focus:border-(--color-primary) focus:bg-(--color-card) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                      placeholder="担当者名"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="email"
                      value={r.email}
                      onChange={(e) => onUpdate(r.id, "email", e.target.value)}
                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] text-(--color-primary) transition-colors hover:border-(--color-border) hover:bg-(--color-card) focus:border-(--color-primary) focus:bg-(--color-card) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                      placeholder="email@example.com"
                    />
                  </td>
                  <td className="px-2 text-center">
                    {rowStatus[r.id]?.state === "sending" && (
                      <SpinnerGap size={15} className="inline-block animate-spin text-(--color-primary)" />
                    )}
                    {rowStatus[r.id]?.state === "sent" && (
                      <Check size={15} weight="bold" className="inline-block" style={{ color: "var(--color-success)" }} />
                    )}
                    {rowStatus[r.id]?.state === "scheduled" && (
                      <span className="text-[11px] font-medium text-(--color-primary)">⏰予約</span>
                    )}
                    {rowStatus[r.id]?.state === "failed" && (
                      <X size={15} weight="bold" className="inline-block" style={{ color: "var(--color-danger)" }} />
                    )}
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => onPreviewRow(r.id)}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-primary-light) hover:text-(--color-primary)"
                      title="プレビュー"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                      title="削除"
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
                {hoveredRowId === r.id && hasContent && (() => {
                  const preview = buildEmail(r);
                  return preview.subject || preview.body ? (
                    <tr className="border-b border-(--color-border)">
                      <td colSpan={8} className="bg-gray-50/80 px-4 py-3 dark:bg-slate-800/60">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">送信プレビュー</p>
                        <p className="mt-1.5 text-[12px] font-semibold">{preview.subject}</p>
                        <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-[1.7] text-(--color-muted)">
                          {preview.body}
                        </p>
                        {preview.unresolved.length > 0 && (
                          <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                            未解決: {preview.unresolved.join(", ")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : null;
                })()}
                {rowStatus[r.id]?.state === "failed" && rowStatus[r.id]?.error && (
                  <tr className="border-b border-(--color-border) last:border-0 bg-(--color-danger-light)">
                    <td colSpan={8} className="px-4 py-2 text-[12px] text-(--color-danger)">
                      {rowStatus[r.id].error}
                    </td>
                  </tr>
                )}
                {rowStatus[r.id]?.state === "sent" && rowStatus[r.id]?.warning && (
                  <tr className="border-b border-(--color-border) last:border-0">
                    <td colSpan={8} className="px-4 py-2 text-[12px] text-amber-600 dark:text-amber-400">
                      {rowStatus[r.id].warning}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recipients.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm text-(--color-muted)">宛先がまだありません</p>
        </div>
      )}

      <div className="flex border-t border-(--color-border)">
        <button
          type="button"
          onClick={onAddOne}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-r border-(--color-border) py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
        >
          <Plus size={14} weight="bold" />
          1件追加
        </button>
        <button
          type="button"
          onClick={onOpenImport}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-r border-(--color-border) py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
        >
          <UploadSimple size={14} weight="bold" />
          スプシ / CSV
        </button>
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-r border-(--color-border) py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
        >
          <ClockCounterClockwise size={14} weight="bold" />
          送信履歴から追加
        </button>
        <button
          type="button"
          onClick={onOpenCompanies}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
        >
          <Buildings size={14} weight="bold" />
          企業一覧から追加
        </button>
      </div>
    </div>
  );
}
