"use client";

import type { Dispatch, SetStateAction } from "react";
import { MagnifyingGlass, Plus, SpinnerGap, X } from "@phosphor-icons/react";
import { Modal } from "@/components/modal";
import type { CompanyWithTag, Contact } from "@/lib/types";

/** 収集元(source)を、非エンジニアにも分かる日本語ラベルにする */
function sourceLabel(source: string): string {
  switch (source) {
    case "keyword_search": return "キーワード検索";
    case "wantedly_direct":
    case "wantedly": return "Wantedly";
    case "csv_import": return "CSV取込";
    case "manual": return "手動追加";
    default: return source || "その他";
  }
}

/** 企業一覧から宛先を追加するモーダル。 */
interface CompaniesModalProps {
  onClose: () => void;
  companiesSearch: string;
  setCompaniesSearch: (value: string) => void;
  companyKeywordOptions: string[];
  companiesKeywordFilter: string;
  setCompaniesKeywordFilter: (value: string) => void;
  companyServiceOptions: string[];
  companiesServiceFilter: string;
  setCompaniesServiceFilter: (value: string) => void;
  companiesLoading: boolean;
  filteredCompanies: CompanyWithTag[];
  contactsByCompanyId: Map<number, Contact[]>;
  companiesChecked: Set<number>;
  setCompaniesChecked: Dispatch<SetStateAction<Set<number>>>;
  allCompaniesModalChecked: boolean;
  toggleCompaniesModalAll: () => void;
  onImport: () => void;
}

export function CompaniesModal({
  onClose,
  companiesSearch,
  setCompaniesSearch,
  companyKeywordOptions,
  companiesKeywordFilter,
  setCompaniesKeywordFilter,
  companyServiceOptions,
  companiesServiceFilter,
  setCompaniesServiceFilter,
  companiesLoading,
  filteredCompanies,
  contactsByCompanyId,
  companiesChecked,
  setCompaniesChecked,
  allCompaniesModalChecked,
  toggleCompaniesModalAll,
  onImport,
}: CompaniesModalProps) {
  return (
    <Modal open onClose={onClose} labelledBy="bulk-companies-title">
      <div className="flex w-full max-w-[640px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
          <h3 id="bulk-companies-title" className="text-[15px] font-semibold">企業一覧から宛先を追加</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger-text)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3">
          <div className="relative">
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
            <input
              type="text"
              value={companiesSearch}
              onChange={(e) => setCompaniesSearch(e.target.value)}
              placeholder="企業名・ドメイン・メールアドレスで検索"
              className="h-9 w-full rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
            />
          </div>
          {(companyKeywordOptions.length > 0 || companyServiceOptions.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {companyKeywordOptions.length > 0 && (
                <select
                  value={companiesKeywordFilter}
                  onChange={(e) => setCompaniesKeywordFilter(e.target.value)}
                  aria-label="キーワードで絞り込む"
                  className="h-9 rounded-lg border border-(--color-border) bg-gray-50 px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                >
                  <option value="">🔍 すべてのキーワード</option>
                  {companyKeywordOptions.map((k) => (
                    <option key={k} value={k}>🔍 {k}</option>
                  ))}
                </select>
              )}
              {companyServiceOptions.length > 0 && (
                <select
                  value={companiesServiceFilter}
                  onChange={(e) => setCompaniesServiceFilter(e.target.value)}
                  aria-label="商材で絞り込む"
                  className="h-9 rounded-lg border border-(--color-border) bg-gray-50 px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                >
                  <option value="">📦 すべての商材</option>
                  {companyServiceOptions.map((s) => (
                    <option key={s} value={s}>📦 {s}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {companiesLoading ? (
            <div className="flex justify-center py-10">
              <SpinnerGap size={24} className="animate-spin text-(--color-muted)" />
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-(--color-muted)">
                {companiesSearch ? "該当する企業がありません" : "送れる状態の企業がありません"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-border) bg-(--color-card) px-4 py-2">
                <input
                  type="checkbox"
                  checked={allCompaniesModalChecked}
                  onChange={toggleCompaniesModalAll}
                  className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                />
                <span className="text-[12px] font-medium text-(--color-muted)">すべて選択（{filteredCompanies.length}社）</span>
              </label>
              {filteredCompanies.map((company) => {
                const contacts = contactsByCompanyId.get(company.id) ?? [];
                const checked = companiesChecked.has(company.id);
                return (
                  <label
                    key={company.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${checked ? "border-(--color-primary) bg-(--color-primary-light)/40" : "border-(--color-border) hover:border-(--color-primary)/50 hover:bg-(--color-card-hover)"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCompaniesChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(company.id)) next.delete(company.id);
                          else next.add(company.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{company.name}</p>
                      <p className="truncate text-[12px] text-(--color-muted)">
                        {contacts.map((c) => c.email).join(", ")}
                      </p>
                      {/*
                        バッジは行の折返しだけ許し、文字の途中では折らない（whitespace-nowrap）。
                        入りきらないバッジは省略記号で切る（max-w-full + truncate）。
                        これが無いと狭い画面で1文字ずつ縦に割れて読めなくなる。
                      */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {company.collection_keyword && (
                          <span
                            title={company.collection_keyword}
                            className="max-w-full shrink-0 truncate whitespace-nowrap rounded bg-(--color-primary-light) px-1.5 py-0.5 text-[10px] font-medium text-(--color-primary-text)"
                          >
                            🔍 {company.collection_keyword}
                          </span>
                        )}
                        {company.collection_service_name && (
                          <span
                            title={company.collection_service_name}
                            className="max-w-full shrink-0 truncate whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          >
                            📦 {company.collection_service_name}
                          </span>
                        )}
                        <span className="max-w-full shrink-0 truncate whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-(--color-muted) dark:bg-slate-700">
                          {sourceLabel(company.source)}
                        </span>
                      </div>
                    </div>
                    {/* ドメインは補助情報。長くても行の幅を食い尽くさないよう上限を決めて省略する */}
                    {company.domain && (
                      <span
                        title={company.domain}
                        className="max-w-[38%] shrink-0 self-start truncate text-[11px] text-(--color-muted)"
                      >
                        {company.domain}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
          <span className="text-xs text-(--color-muted)">
            {companiesChecked.size > 0 && (
              <>選択中: <strong className="font-semibold text-(--color-foreground)">{companiesChecked.size}</strong> 社</>
            )}
          </span>
          <button
            type="button"
            onClick={onImport}
            disabled={companiesChecked.size === 0}
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
