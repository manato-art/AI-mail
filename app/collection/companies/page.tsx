"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise,
  CheckCircle,
  EnvelopeSimple,
  GlobeSimple,
  Hourglass,
  PaperPlaneTilt,
  SpinnerGap,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import type { CompanyWithTag, Contact } from "@/lib/types";
import { ActivityLogPanel } from "../activity-log-panel";
import { Toast } from "@/components/toast";

const SOURCE_LABELS: Record<string, string> = {
  keyword_search: "キーワード検索",
  auto_collection: "自動収集",
  csv_import: "CSV取込",
  manual: "手動",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle; className: string }
> = {
  done: {
    label: "完了",
    icon: CheckCircle,
    className: "text-(--color-success)",
  },
  pending: {
    label: "準備中",
    icon: Hourglass,
    className: "text-(--color-warning)",
  },
  failed: {
    label: "調査できず",
    icon: XCircle,
    className: "text-(--color-danger)",
  },
  excluded: {
    label: "除外",
    icon: WarningCircle,
    className: "text-(--color-muted)",
  },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  let iso = value.replace(" ", "T");
  if (!/[Z+]/.test(iso) && !/T\d{2}:\d{2}:\d{2}[+-]/.test(iso)) {
    iso += "Z";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyWithTag[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "done" | "pending" | "failed">(
    "all",
  );
  // F1 タグ絞り込み: どのキーワード・どの商材で集めた企業かで絞る
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [reEnriching, setReEnriching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingHpId, setEditingHpId] = useState<number | null>(null);
  const [hpUrlInput, setHpUrlInput] = useState("");
  const [savingHpUrl, setSavingHpUrl] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }, []);

  const saveHpUrl = useCallback(async (companyId: number, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSavingHpUrl(true);
    try {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: companyId, hp_url: trimmed }),
      });
      if (res.ok) {
        const { company } = await res.json();
        setCompanies((prev) =>
          prev.map((c) => (c.id === companyId ? { ...c, ...company } : c))
        );
        setEditingHpId(null);
        setHpUrlInput("");
        showToast("HP URLを保存しました");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "HP URLの保存に失敗しました");
      }
    } catch {
      showToast("HP URLの保存に失敗しました（通信エラー）");
    } finally {
      setSavingHpUrl(false);
    }
  }, [showToast]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies);
        setContacts(data.contacts);
      }
    } catch {
      /* next refresh will retry */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const contactsByCompany = useMemo(() => {
    const map = new Map<number, Contact[]>();
    for (const c of contacts) {
      if (c.company_id == null) continue;
      const list = map.get(c.company_id) ?? [];
      list.push(c);
      map.set(c.company_id, list);
    }
    return map;
  }, [contacts]);

  const noEmailCount = useMemo(() => {
    return companies.filter(
      (c) =>
        c.enrichment_status === "done" &&
        !(contactsByCompany.get(c.id) ?? []).some((ct) => ct.email),
    ).length;
  }, [companies, contactsByCompany]);

  const handleReEnrich = useCallback(async () => {
    setReEnriching(true);
    try {
      const res = await fetch("/api/companies/re-enrich", { method: "POST" });
      if (res.ok) {
        await load();
        showToast("メール未取得の企業を再調査キューに入れました");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "再調査の開始に失敗しました");
      }
    } catch {
      showToast("再調査の開始に失敗しました（通信エラー）");
    } finally {
      setReEnriching(false);
    }
  }, [load, showToast]);

  // 絞り込みの選択肢（実際に企業に付いているキーワード・商材だけ出す）
  const keywordOptions = useMemo(
    () => [...new Set(companies.map((c) => c.collection_keyword).filter((k): k is string => !!k))].sort(),
    [companies],
  );
  const serviceOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of companies) {
      if (c.collection_service_id != null && c.collection_service_name) {
        map.set(c.collection_service_id, c.collection_service_name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [companies]);

  const filtered = companies.filter((c) => {
    if (filter !== "all" && c.enrichment_status !== filter) return false;
    if (keywordFilter !== "all" && c.collection_keyword !== keywordFilter) return false;
    if (serviceFilter !== "all" && String(c.collection_service_id) !== serviceFilter) return false;
    return true;
  });

  const selectableFiltered = useMemo(
    () => filtered.filter((c) => c.hp_url),
    [filtered],
  );

  const allSelectableChecked =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((c) => selectedIds.has(c.id));

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelectableChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableFiltered.map((c) => c.id)));
    }
  }

  function handleGenerateSelected() {
    const ids = companies
      .filter((c) => selectedIds.has(c.id) && c.hp_url)
      .map((c) => c.id);
    if (ids.length === 0) return;
    sessionStorage.setItem("batch-generate-company-ids", JSON.stringify(ids));
    router.push("/generate?mode=batch");
  }

  const counts = {
    all: companies.length,
    done: companies.filter((c) => c.enrichment_status === "done").length,
    pending: companies.filter((c) => c.enrichment_status === "pending").length,
    failed: companies.filter((c) => c.enrichment_status === "failed").length,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-(--color-muted)">
        <SpinnerGap size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-(--color-muted)">
          自動収集・キーワード検索・CSV取込で集めた企業の一覧です。
        </p>
        <div className="flex items-center gap-2">
          {noEmailCount > 0 && (
            <button
              type="button"
              onClick={handleReEnrich}
              disabled={reEnriching}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {reEnriching ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <EnvelopeSimple size={14} />
              )}
              {reEnriching
                ? "再取得中..."
                : `${noEmailCount}社のメールを再取得`}
            </button>
          )}
          <button
            type="button"
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium transition-colors hover:bg-(--color-card-hover) cursor-pointer"
          >
            <ArrowClockwise size={14} />
            更新
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "done", "pending", "failed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
              filter === key
                ? "bg-(--color-primary) text-white"
                : "bg-(--color-card) text-(--color-muted) hover:bg-(--color-card-hover)"
            }`}
          >
            {key === "all" ? "すべて" : STATUS_CONFIG[key]?.label ?? key}
            <span className="ml-1.5 tabular-nums">({counts[key]})</span>
          </button>
        ))}

        {/* F1: キーワード・商材タグでの絞り込み（該当タグが1つでもある時だけ出す） */}
        {keywordOptions.length > 0 && (
          <select
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            title="収集キーワードで絞り込む"
            className="h-8 rounded-lg border border-(--color-border) bg-(--color-card) px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          >
            <option value="all">すべてのキーワード</option>
            {keywordOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        )}
        {serviceOptions.length > 0 && (
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            title="商材タグで絞り込む"
            className="h-8 rounded-lg border border-(--color-border) bg-(--color-card) px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          >
            <option value="all">すべての商材</option>
            {serviceOptions.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-(--color-muted)">
          {companies.length === 0
            ? "企業がまだありません。自動収集やキーワード検索で追加できます。"
            : "該当する企業がありません。"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-(--color-border)">
          <table className="w-full min-w-[700px] text-[13px]">
            <thead>
              <tr className="border-b border-(--color-border) bg-(--color-card) text-left text-(--color-muted)">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelectableChecked}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 accent-(--color-primary) cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 font-medium">企業名</th>
                <th className="px-4 py-3 font-medium">メール</th>
                <th className="px-4 py-3 font-medium">経路</th>
                <th className="px-4 py-3 font-medium">ステータス</th>
                <th className="px-4 py-3 font-medium">登録日</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => {
                const companyContacts = contactsByCompany.get(company.id) ?? [];
                const email = companyContacts[0]?.email ?? null;
                const cfg = STATUS_CONFIG[company.enrichment_status];
                const StatusIcon = cfg?.icon ?? Hourglass;
                return (
                  <tr
                    key={company.id}
                    className="border-b border-(--color-border) last:border-0 hover:bg-(--color-card-hover) transition-colors"
                  >
                    <td className="px-3 py-3">
                      {company.hp_url ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(company.id)}
                          onChange={() => toggleOne(company.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-(--color-primary) cursor-pointer"
                        />
                      ) : (
                        <span className="block h-4 w-4" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{company.name}</p>
                        {company.hp_url ? (
                          <p className="mt-0.5 truncate text-[11px] text-(--color-muted) max-w-[250px]">
                            {company.domain || company.hp_url}
                          </p>
                        ) : editingHpId === company.id ? (
                          <form
                            className="mt-1 flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveHpUrl(company.id, hpUrlInput);
                            }}
                          >
                            <input
                              type="url"
                              autoFocus
                              value={hpUrlInput}
                              onChange={(e) => setHpUrlInput(e.target.value)}
                              placeholder="https://example.com"
                              className="h-7 w-48 rounded border border-(--color-border) bg-transparent px-2 text-[11px] outline-none focus:border-(--color-primary)"
                            />
                            <button
                              type="submit"
                              disabled={savingHpUrl || !hpUrlInput.trim()}
                              className="h-7 rounded bg-(--color-primary) px-2 text-[11px] font-medium text-white disabled:opacity-50 cursor-pointer"
                            >
                              {savingHpUrl ? "..." : "保存"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingHpId(null); setHpUrlInput(""); }}
                              className="h-7 px-1.5 text-[11px] text-(--color-muted) hover:text-(--color-text) cursor-pointer"
                            >
                              ✕
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setEditingHpId(company.id); setHpUrlInput(""); }}
                            className="mt-0.5 flex items-center gap-1 text-[11px] text-(--color-primary) hover:underline cursor-pointer"
                          >
                            <GlobeSimple size={12} />
                            HP追加
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-(--color-muted)">
                      {email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-(--color-card) px-2 py-0.5 text-[11px] text-(--color-muted)">
                        {company.source_detail || (SOURCE_LABELS[company.source] ?? company.source)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 ${cfg?.className ?? ""}`}>
                        <StatusIcon size={14} />
                        {cfg?.label ?? company.enrichment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-(--color-muted) whitespace-nowrap">
                      {formatDate(company.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 px-4 py-3 shadow-lg animate-fade-in">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            <span className="tabular-nums text-(--color-primary)">{selectedIds.size}</span>社を選択中
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="h-8 px-3 rounded-lg text-[13px] font-medium text-(--color-muted) hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              選択解除
            </button>
            <button
              type="button"
              onClick={handleGenerateSelected}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-medium text-white hover:opacity-90 transition-colors cursor-pointer"
            >
              <PaperPlaneTilt size={14} weight="fill" />
              メール生成
            </button>
          </div>
        </div>
      )}

      <ActivityLogPanel />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
