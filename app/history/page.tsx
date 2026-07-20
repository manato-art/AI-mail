"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CaretDown,
  DownloadSimple,
  FunnelSimple,
  MagnifyingGlass,
  Prohibit,
  SpinnerGap,
  Tray,
  X,
} from "@phosphor-icons/react";
import type { Prospect, SendStatus, Service } from "@/lib/types";

const COMPATIBILITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const COMPATIBILITY_STYLES: Record<string, string> = {
  high: "bg-(--color-success-light) text-(--color-success)",
  medium: "bg-(--color-warning-light) text-(--color-warning)",
  low: "bg-(--color-danger-light) text-(--color-danger)",
};

const STATUS_LABELS: Record<SendStatus, string> = {
  unsent: "未送信",
  sent: "送信済",
  replied: "返信あり",
  meeting: "商談中",
  rejected: "見送り",
};

const STATUS_STYLES: Record<SendStatus, string> = {
  unsent: "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400",
  sent: "bg-(--color-primary-light) text-(--color-primary)",
  replied: "bg-(--color-success-light) text-(--color-success)",
  meeting: "bg-(--color-warning-light) text-(--color-warning)",
  rejected: "bg-(--color-danger-light) text-(--color-danger)",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default function HistoryPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterCompat, setFilterCompat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterService, setFilterService] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [prospectsRes, servicesRes] = await Promise.all([
          fetch("/api/prospects"),
          fetch("/api/services"),
        ]);
        if (!prospectsRes.ok) throw new Error("履歴の取得に失敗しました。");
        const prospectsData: Prospect[] = await prospectsRes.json();
        const servicesData: Service[] = servicesRes.ok ? await servicesRes.json() : [];
        if (!cancelled) {
          setProspects(prospectsData);
          setServices(servicesData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "履歴の取得に失敗しました。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const serviceNameMap = useMemo(() => {
    const map = new Map<number, string>();
    services.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [services]);

  const filtered = useMemo(() => {
    const sorted = [...prospects].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = (p.company_name || "").toLowerCase().includes(q);
        const matchDomain = p.domain.toLowerCase().includes(q);
        const matchSubject = p.subject.toLowerCase().includes(q);
        if (!matchName && !matchDomain && !matchSubject) return false;
      }
      if (filterCompat && p.compatibility_score !== filterCompat) return false;
      if (filterStatus && p.send_status !== filterStatus) return false;
      if (filterService && p.service_id !== Number(filterService)) return false;
      return true;
    });
  }, [prospects, search, filterCompat, filterStatus, filterService]);

  const hasActiveFilters = Boolean(filterCompat || filterStatus || filterService);

  function clearFilters() {
    setFilterCompat("");
    setFilterStatus("");
    setFilterService("");
  }

  const [suppressingDomain, setSuppressingDomain] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  async function handleStatusChange(prospectId: number, newStatus: SendStatus) {
    setUpdatingStatusId(prospectId);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "ステータスの更新に失敗しました");
        return;
      }
      setProspects((prev) =>
        prev.map((p) => (p.id === prospectId ? { ...p, send_status: newStatus } : p))
      );
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleSuppress(prospect: Prospect) {
    if (!confirm(`${prospect.domain} を送信しないリストに追加しますか？`)) return;
    setSuppressingDomain(prospect.domain);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: prospect.domain,
          target_type: "domain",
          reason: "manual",
          note: `履歴一覧 prospect #${prospect.id} から追加`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "追加に失敗しました");
        return;
      }
      alert(`${prospect.domain} を送信しないリストに追加しました`);
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setSuppressingDomain(null);
    }
  }

  function handleExportCsv() {
    window.open("/api/prospects/export", "_blank");
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">生成履歴</h1>
          {!loading && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-(--color-primary-light) px-2 text-xs font-semibold text-(--color-primary)">
              {filtered.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={prospects.length === 0}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3 text-xs font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <DownloadSimple size={14} />
          CSV出力
        </button>
      </div>

      {/* Search & Filters */}
      {!loading && prospects.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted) pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="企業名・ドメイン・件名で検索"
                className="h-9 w-full rounded-lg border border-(--color-border) bg-(--color-card) pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                showFilters || hasActiveFilters
                  ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)"
                  : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"
              }`}
            >
              <FunnelSimple size={14} />
              フィルター
              {hasActiveFilters && (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-(--color-primary) text-[10px] font-bold text-white">
                  {[filterCompat, filterStatus, filterService].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-2 md:flex md:flex-wrap md:items-end md:gap-3 rounded-lg border border-(--color-border) bg-(--color-card) p-3 animate-fade-in">
              <div className="min-w-[140px]">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">相性</label>
                <select value={filterCompat} onChange={(e) => setFilterCompat(e.target.value)} className="h-8 w-full appearance-none rounded-md border border-(--color-border) bg-(--color-card) px-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)">
                  <option value="">すべて</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">ステータス</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-8 w-full appearance-none rounded-md border border-(--color-border) bg-(--color-card) px-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)">
                  <option value="">すべて</option>
                  {(Object.entries(STATUS_LABELS) as [SendStatus, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">サービス</label>
                <select value={filterService} onChange={(e) => setFilterService(e.target.value)} className="h-8 w-full appearance-none rounded-md border border-(--color-border) bg-(--color-card) px-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)">
                  <option value="">すべて</option>
                  {services.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-(--color-border) px-2.5 text-[11px] font-medium text-(--color-muted) hover:text-(--color-danger)"
                >
                  <X size={12} />
                  リセット
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-(--color-danger) bg-(--color-danger-light) p-4 text-sm text-(--color-danger)">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-(--color-border) bg-(--color-card) py-20 text-center">
          <SpinnerGap size={20} className="animate-spin text-(--color-primary)" />
          <p className="text-sm text-(--color-muted)">読み込み中...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-card) px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-gray-500">
            <Tray size={24} />
          </div>
          <p className="text-sm text-(--color-muted)">
            {prospects.length > 0 ? "条件に一致する履歴がありません" : "まだ生成履歴がありません。"}
          </p>
          {prospects.length === 0 && (
            <Link
              href="/generate"
              className="mt-1 inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--color-border) px-4 text-sm font-medium text-gray-700 hover:bg-(--color-card-hover) dark:text-gray-300"
            >
              メールを作成する
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-(--color-border) rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            {filtered.map((prospect) => (
              <Link key={prospect.id} href={`/prospect/${prospect.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-(--color-card-hover) transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{prospect.company_name || prospect.domain}</span>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${COMPATIBILITY_STYLES[prospect.compatibility_score]}`}>
                      {COMPATIBILITY_LABELS[prospect.compatibility_score]}
                    </span>
                  </div>
                  <p className="text-xs text-(--color-muted) truncate mt-0.5">{truncate(prospect.subject, 50)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-(--color-muted)">{formatDate(prospect.created_at)}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[prospect.send_status as SendStatus] ?? STATUS_STYLES.unsent}`}>
                      {STATUS_LABELS[prospect.send_status as SendStatus] ?? "未送信"}
                    </span>
                  </div>
                </div>
                <ArrowRight size={14} className="shrink-0 text-(--color-muted)" />
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) bg-gray-50 text-left dark:bg-slate-700/50">
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">日付</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">会社名</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">サービス</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">相性</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">ステータス</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">件名</th>
                      <th className="whitespace-nowrap px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((prospect) => (
                      <tr key={prospect.id} className="border-b border-(--color-border) last:border-0 hover:bg-(--color-card-hover)">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                          {formatDate(prospect.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {prospect.company_name || prospect.domain}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                          {serviceNameMap.get(prospect.service_id) ?? `#${prospect.service_id}`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COMPATIBILITY_STYLES[prospect.compatibility_score] ?? "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400"}`}>
                            {COMPATIBILITY_LABELS[prospect.compatibility_score] ?? prospect.compatibility_score}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="relative inline-flex">
                            <select
                              value={(prospect.send_status as SendStatus) || "unsent"}
                              onChange={(e) => handleStatusChange(prospect.id, e.target.value as SendStatus)}
                              disabled={updatingStatusId === prospect.id}
                              className={`h-7 appearance-none rounded-full border-2 border-transparent bg-transparent py-0 pl-2.5 pr-6 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20 disabled:opacity-50 ${STATUS_STYLES[prospect.send_status as SendStatus] ?? STATUS_STYLES.unsent}`}
                            >
                              {(Object.entries(STATUS_LABELS) as [SendStatus, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <CaretDown size={10} weight="bold" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {truncate(prospect.subject, 40)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); handleSuppress(prospect); }}
                              disabled={suppressingDomain === prospect.domain}
                              title="送信しないリストに追加"
                              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-(--color-border) text-(--color-muted) transition-colors hover:border-(--color-danger) hover:text-(--color-danger) disabled:opacity-50"
                            >
                              <Prohibit size={14} />
                            </button>
                            <Link
                              href={`/prospect/${prospect.id}`}
                              className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) px-3 text-xs font-medium text-gray-700 hover:bg-(--color-card-hover) hover:text-(--color-primary) dark:text-gray-300"
                            >
                              詳細
                              <ArrowRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
