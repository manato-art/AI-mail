"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  Envelope,
  EnvelopeSimple,
  FileText,
  MagnifyingGlass,
  PaperPlaneTilt,
  Sparkle,
  Tag,
  Path,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { CompanyWithTag } from "@/lib/types";
import { classifyGenStatus, type GenStatus } from "@/lib/gen-status";
import { LABEL } from "@/components/ui-kit";

/** 収集経路の表示名（企業選択のタグ表示用） */
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

/**
 * 生成/送信の状態バッジ。分類の優先順は送信済み > 生成済み > 未生成（classifyGenStatus）。
 * 状態は「色＋アイコン＋日本語」の3点セット（IA-DESIGN §5-4。絵文字は使わない）。
 */
const GEN_STATUS_META: Record<
  GenStatus,
  { label: string; cls: string; Icon: ComponentType<IconProps> }
> = {
  sent: {
    label: "送信済み",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    Icon: PaperPlaneTilt,
  },
  generated: {
    label: "生成済み・未送信",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    Icon: FileText,
  },
  none: {
    label: "未生成",
    cls: "bg-gray-100 text-(--color-muted) dark:bg-slate-700",
    Icon: Sparkle,
  },
};

const PICKER_SELECT =
  "h-11 rounded-lg border border-(--color-border) bg-(--color-card) px-2 text-[13px] text-(--color-foreground) focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25 disabled:opacity-50";

const TAG =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium";

export function CompanyPicker({
  companies,
  emailCompanyIds,
  sentDomains,
  generatedDomains,
  selectedIds,
  onToggle,
  onToggleAll,
  search,
  onSearchChange,
  disabled,
  initialServiceName,
}: {
  companies: CompanyWithTag[];
  emailCompanyIds: Set<number>;
  sentDomains: Set<string>;
  generatedDomains: Set<string>;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: Set<number>) => void;
  search: string;
  onSearchChange: (v: string) => void;
  disabled: boolean;
  /** 上部バーで選んでいる商材名。手で選ぶまでの初期値にだけ使う（IA-DESIGN §3.4） */
  initialServiceName: string | null;
}) {
  // どのキーワード・どの商材向けに集めた企業かで絞り込めるよう、実データから選択肢を作る
  const [keywordFilter, setKeywordFilter] = useState("");
  // null = まだ自分で選んでいない（上部バーの商材が初期値になる）
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  // メアド有無で絞る（"" すべて / "has" メアドあり / "none" メアド未取得）
  const [emailFilter, setEmailFilter] = useState("");
  // 生成/送信状態で絞る（"" すべて / "none" 未生成 / "generated" 生成済み・未送信 / "sent" 送信済み）
  const [statusFilter, setStatusFilter] = useState("");

  // 企業ごとの生成/送信状態を domain 突き合わせで1つに分類（送信済み > 生成済み > 未生成）
  const statusById = useMemo(() => {
    const m = new Map<number, GenStatus>();
    for (const c of companies) {
      m.set(c.id, classifyGenStatus(c.domain, sentDomains, generatedDomains));
    }
    return m;
  }, [companies, sentDomains, generatedDomains]);

  const keywordOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) if (c.collection_keyword) set.add(c.collection_keyword);
    return [...set].sort();
  }, [companies]);
  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) if (c.collection_service_name) set.add(c.collection_service_name);
    return [...set].sort();
  }, [companies]);

  // 上部バーの商材を初期値にする。select で手動上書きできる（すべて＝従来どおり）
  const serviceFilterValue =
    serviceFilter ??
    (initialServiceName && serviceOptions.includes(initialServiceName) ? initialServiceName : "");

  const filtered = useMemo(() => {
    let list = companies;
    if (keywordFilter) list = list.filter((c) => c.collection_keyword === keywordFilter);
    if (serviceFilterValue) list = list.filter((c) => c.collection_service_name === serviceFilterValue);
    if (emailFilter === "has") list = list.filter((c) => emailCompanyIds.has(c.id));
    else if (emailFilter === "none") list = list.filter((c) => !emailCompanyIds.has(c.id));
    if (statusFilter) list = list.filter((c) => (statusById.get(c.id) ?? "none") === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.domain ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [companies, keywordFilter, serviceFilterValue, emailFilter, emailCompanyIds, statusFilter, statusById, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  /** フィルタの外で選んでいる企業は触らない（差分でだけ足し引きする） */
  function handleToggleAll() {
    if (allFilteredSelected) {
      const removeIds = new Set(filtered.map((c) => c.id));
      onToggleAll(new Set([...selectedIds].filter((id) => !removeIds.has(id))));
    } else {
      onToggleAll(new Set([...selectedIds, ...filtered.map((c) => c.id)]));
    }
  }

  return (
    <div>
      <span className={LABEL}>送信先の企業を選択</span>
      <div className="overflow-hidden rounded-lg border border-(--color-border)">
        <div className="flex items-center gap-2 border-b border-(--color-border) bg-(--color-card-hover) px-3">
          <MagnifyingGlass size={16} className="shrink-0 text-(--color-muted)" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
            placeholder="企業名で検索..."
            aria-label="企業名で検索"
            className="min-h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-(--color-muted) disabled:opacity-50"
          />
          {selectedIds.size > 0 && (
            <span className="shrink-0 rounded-full bg-(--color-primary) px-2 py-0.5 text-[12px] font-medium tabular-nums text-white">
              {selectedIds.size}
            </span>
          )}
        </div>

        {companies.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-(--color-border) px-3 py-2">
            <select
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              disabled={disabled}
              aria-label="メール有無で絞り込む"
              className={PICKER_SELECT}
            >
              <option value="">メアド有無：すべて</option>
              <option value="has">メアドあり</option>
              <option value="none">メアド未取得</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={disabled}
              aria-label="生成・送信の状態で絞り込む"
              className={PICKER_SELECT}
            >
              <option value="">生成状態：すべて</option>
              <option value="none">未生成</option>
              <option value="generated">生成済み・未送信</option>
              <option value="sent">送信済み</option>
            </select>
            {keywordOptions.length > 0 && (
              <select
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                disabled={disabled}
                aria-label="キーワードで絞り込む"
                className={PICKER_SELECT}
              >
                <option value="">すべてのキーワード</option>
                {keywordOptions.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            )}
            {serviceOptions.length > 0 && (
              <select
                value={serviceFilterValue}
                onChange={(e) => setServiceFilter(e.target.value)}
                disabled={disabled}
                aria-label="商材で絞り込む"
                className={PICKER_SELECT}
              >
                <option value="">すべての商材</option>
                {serviceOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="max-h-[260px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-(--color-muted)">
              {companies.length === 0
                ? "調査済みの企業がありません"
                : "該当する企業がありません"}
            </p>
          ) : (
            <>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-(--color-border) bg-(--color-card-hover) px-3 py-2 transition-colors motion-reduce:transition-none hover:bg-(--color-border)/40">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleToggleAll}
                  disabled={disabled}
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-(--color-primary)"
                />
                <span className="text-[13px] font-medium text-(--color-muted)">
                  すべて選択（{filtered.length}社）
                </span>
              </label>
              {filtered.map((company) => {
                const meta = GEN_STATUS_META[statusById.get(company.id) ?? "none"];
                return (
                  <label
                    key={company.id}
                    className="flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover)"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id)}
                      onChange={() => onToggle(company.id)}
                      disabled={disabled}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-(--color-primary)"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block min-w-0 truncate text-[13px]">
                        <span className="font-medium">{company.name}</span>
                        {company.domain && (
                          <span className="ml-1.5 text-[12px] text-(--color-muted)">
                            {company.domain}
                          </span>
                        )}
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={`${TAG} ${meta.cls}`}>
                          <meta.Icon size={11} weight="bold" />
                          {meta.label}
                        </span>
                        {emailCompanyIds.has(company.id) ? (
                          <span className={`${TAG} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>
                            <Envelope size={11} weight="bold" />
                            メアドあり
                          </span>
                        ) : (
                          /* 送信できない相手に生成しないための判断材料。消さない */
                          <span className={`${TAG} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>
                            <EnvelopeSimple size={11} weight="bold" />
                            メアド未取得
                          </span>
                        )}
                        {company.collection_keyword && (
                          <span className={`${TAG} bg-(--color-primary-light) text-(--color-primary)`}>
                            <MagnifyingGlass size={11} weight="bold" />
                            {company.collection_keyword}
                          </span>
                        )}
                        {company.collection_service_name && (
                          <span className={`${TAG} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>
                            <Tag size={11} weight="bold" />
                            {company.collection_service_name}
                          </span>
                        )}
                        <span className={`${TAG} bg-gray-100 font-normal text-(--color-muted) dark:bg-slate-700`}>
                          <Path size={11} weight="bold" />
                          {sourceLabel(company.source)}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
