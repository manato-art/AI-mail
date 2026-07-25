"use client";

import type { Dispatch, SetStateAction } from "react";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { Modal } from "@/components/modal";
import type { Prospect } from "@/lib/types";

/** 送信履歴から宛先を追加するモーダル。 */
interface HistoryModalProps {
  onClose: () => void;
  historySearch: string;
  setHistorySearch: (value: string) => void;
  historyServiceFilter: string;
  setHistoryServiceFilter: (value: string) => void;
  historyServiceOptions: { id: number; name: string }[];
  sentProspects: Prospect[];
  historyChecked: Set<number>;
  setHistoryChecked: Dispatch<SetStateAction<Set<number>>>;
  allHistoryChecked: boolean;
  toggleHistoryAll: () => void;
  onImport: () => void;
}

export function HistoryModal({
  onClose,
  historySearch,
  setHistorySearch,
  historyServiceFilter,
  setHistoryServiceFilter,
  historyServiceOptions,
  sentProspects,
  historyChecked,
  setHistoryChecked,
  allHistoryChecked,
  toggleHistoryAll,
  onImport,
}: HistoryModalProps) {
  return (
    <Modal open onClose={onClose} labelledBy="bulk-history-title">
      <div className="flex w-full max-w-[640px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
          <h3 id="bulk-history-title" className="text-[15px] font-semibold">送信履歴から宛先を追加</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3">
          <div className="relative">
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="企業名・ドメイン・メールアドレスで検索"
              className="h-9 w-full rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
            />
          </div>
          {historyServiceOptions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <select
                value={historyServiceFilter}
                onChange={(e) => setHistoryServiceFilter(e.target.value)}
                aria-label="商材で絞り込む"
                className="h-8 rounded-lg border border-(--color-border) bg-gray-50 px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
              >
                <option value="">📦 すべての商材</option>
                {historyServiceOptions.map((s) => (
                  <option key={s.id} value={String(s.id)}>📦 {s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {sentProspects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-(--color-muted)">
                {historySearch ? "該当する送信履歴がありません" : "送信済みの宛先がありません"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-border) bg-(--color-card) px-4 py-2">
                <input
                  type="checkbox"
                  checked={allHistoryChecked}
                  onChange={toggleHistoryAll}
                  className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                />
                <span className="text-[12px] font-medium text-(--color-muted)">すべて選択（{sentProspects.length}件）</span>
              </label>
              {sentProspects.map((p) => {
                const emails: string[] = p.emails_found_json ? JSON.parse(p.emails_found_json) : [];
                const checked = historyChecked.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${checked ? "border-(--color-primary) bg-(--color-primary-light)/40" : "border-(--color-border) hover:border-(--color-primary)/50 hover:bg-(--color-card-hover)"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setHistoryChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{p.company_name || p.domain}</p>
                      <p className="truncate text-[12px] text-(--color-muted)">{emails.join(", ")}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-(--color-muted)">
                      {new Date(p.created_at).toLocaleDateString("ja-JP")}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
          <span className="text-xs text-(--color-muted)">
            {historyChecked.size > 0 && (
              <>選択中: <strong className="font-semibold text-(--color-foreground)">{historyChecked.size}</strong> 件</>
            )}
          </span>
          <button
            type="button"
            onClick={onImport}
            disabled={historyChecked.size === 0}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} weight="bold" />
            宛先に追加
          </button>
        </div>
      </div>
    </Modal>
  );
}
