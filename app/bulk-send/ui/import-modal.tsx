"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { Check, FileArrowUp, SpinnerGap, X } from "@phosphor-icons/react";
import { Modal } from "@/components/modal";
import type { ColumnKind } from "@/lib/import-parse";

/** スプシ貼り付け / CSV・Excel ファイルから宛先を一括追加するモーダル。 */
interface ImportModalProps {
  onClose: () => void;
  importTab: "paste" | "csv";
  setImportTab: (tab: "paste" | "csv") => void;
  pasteText: string;
  setPasteText: (value: string) => void;
  parsedPreviewCount: number;
  onPasteImport: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickFile: (file: File) => void;
  parsing: boolean;
  sheet: { headers: string[]; rows: string[][] } | null;
  resetSheet: () => void;
  columnKinds: ColumnKind[];
  setColumnKinds: Dispatch<SetStateAction<ColumnKind[]>>;
  onApplyMapping: () => void;
  importError: string | null;
}

export function ImportModal({
  onClose,
  importTab,
  setImportTab,
  pasteText,
  setPasteText,
  parsedPreviewCount,
  onPasteImport,
  fileInputRef,
  onPickFile,
  parsing,
  sheet,
  resetSheet,
  columnKinds,
  setColumnKinds,
  onApplyMapping,
  importError,
}: ImportModalProps) {
  return (
    <Modal open onClose={onClose} labelledBy="bulk-import-title">
      <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
          <h3 id="bulk-import-title" className="text-[15px] font-semibold">宛先を一括追加</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger-text)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex overflow-hidden rounded-lg border border-(--color-border)">
            <button
              type="button"
              onClick={() => setImportTab("paste")}
              className={`flex-1 cursor-pointer border-r border-(--color-border) py-2.5 text-center text-[13px] font-medium transition-colors ${importTab === "paste" ? "bg-(--color-primary-light) font-semibold text-(--color-primary-text)" : "text-(--color-muted) hover:bg-(--color-card-hover)"}`}
            >
              スプシからコピペ
            </button>
            <button
              type="button"
              onClick={() => setImportTab("csv")}
              className={`flex-1 cursor-pointer py-2.5 text-center text-[13px] font-medium transition-colors ${importTab === "csv" ? "bg-(--color-primary-light) font-semibold text-(--color-primary-text)" : "text-(--color-muted) hover:bg-(--color-card-hover)"}`}
            >
              CSVファイル
            </button>
          </div>

          {importTab === "paste" ? (
            <>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={7}
                className="w-full rounded-lg border border-(--color-border) bg-gray-50 p-3 font-mono text-[13px] leading-[1.7] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                placeholder={"スプレッドシートからコピーして貼り付け\n\n株式会社メルカリ\t田中 太郎\ttanaka@mercari.com\nfreee株式会社\t佐藤 花子\tsato@freee.co.jp"}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-(--color-muted)">
                スプレッドシートから <code className="rounded border border-(--color-border) bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">企業名</code>{" "}
                <code className="rounded border border-(--color-border) bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">担当者名</code>{" "}
                <code className="rounded border border-(--color-border) bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">メールアドレス</code>{" "}
                の3列を選択してコピー → ここに貼り付けてください。
              </p>
            </>
          ) : sheet ? (
            <>
              <p className="mb-2 text-[12px] text-(--color-muted)">
                それぞれの列が何かを指定してください（{sheet.rows.length}行を読み込みました）
              </p>
              <div className="max-h-[280px] overflow-auto rounded-lg border border-(--color-border)">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800">
                    <tr>
                      {columnKinds.map((kind, i) => (
                        <th key={i} className="border-b border-(--color-border) p-2 text-left">
                          <select
                            value={kind}
                            onChange={(e) =>
                              setColumnKinds((prev) =>
                                prev.map((k, idx) => (idx === i ? (e.target.value as ColumnKind) : k))
                              )
                            }
                            className="h-8 w-full rounded-md border border-(--color-border) bg-(--color-card) px-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                          >
                            <option value="company">企業名</option>
                            <option value="person">担当者名</option>
                            <option value="email">メールアドレス</option>
                            <option value="lp_url">個社LPのURL</option>
                            <option value="ignore">使わない</option>
                          </select>
                          {sheet.headers[i] && (
                            <span className="mt-1 block truncate text-[10px] font-normal text-(--color-muted)">
                              {sheet.headers[i]}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} className="border-b border-(--color-border) last:border-0">
                        {columnKinds.map((kind, ci) => (
                          <td
                            key={ci}
                            className={`max-w-[160px] truncate p-2 ${kind === "ignore" ? "text-(--color-muted) opacity-50" : ""}`}
                          >
                            {row[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheet.rows.length > 5 && (
                <p className="mt-1.5 text-[11px] text-(--color-muted)">
                  先頭5行のみ表示しています（全{sheet.rows.length}行を取り込みます）
                </p>
              )}
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-(--color-border) px-6 py-10 transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-light) disabled:opacity-50"
              >
                {parsing ? (
                  <SpinnerGap size={32} className="animate-spin text-(--color-primary-text)" />
                ) : (
                  <FileArrowUp size={32} className="text-(--color-muted)" />
                )}
                <p className="text-[13px] text-(--color-muted)">
                  {parsing ? "読み込み中..." : "クリックしてファイルを選択"}
                </p>
                <p className="text-[11px] text-(--color-muted)">CSV・Excel（.xlsx）対応 / 最大10MB</p>
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-(--color-muted)">
                ヘッダー行と文字コード（UTF-8 / Shift_JIS）は自動で判定します。
                読み込んだあとに、どの列が企業名・担当者名・メールアドレスかを指定できます。
              </p>
            </>
          )}

          {importError && (
            <p className="mt-2.5 rounded-lg bg-(--color-danger-light) px-3 py-2 text-[12px] text-(--color-danger-text)">
              {importError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
          <span className="text-xs text-(--color-muted)">
            {importTab === "paste" && parsedPreviewCount > 0 && (
              <>検出: <strong className="font-semibold text-(--color-foreground)">{parsedPreviewCount}</strong> 件の宛先</>
            )}
            {sheet && (
              <>読み込み: <strong className="font-semibold text-(--color-foreground)">{sheet.rows.length}</strong> 行</>
            )}
          </span>
          <div className="flex gap-2">
            {sheet && (
              <button
                type="button"
                onClick={resetSheet}
                className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) transition-colors hover:text-(--color-foreground)"
              >
                別のファイル
              </button>
            )}
            {importTab === "paste" && (
              <button
                type="button"
                onClick={onPasteImport}
                disabled={parsedPreviewCount === 0}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={14} weight="bold" />
                {parsedPreviewCount}件を追加
              </button>
            )}
            {sheet && (
              <button
                type="button"
                onClick={onApplyMapping}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
              >
                <Check size={14} weight="bold" />
                この内容で追加
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
