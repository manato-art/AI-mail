"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CaretDown,
  ChatCircleDots,
  DownloadSimple,
  FileDashed,
  Handshake,
  ListChecks,
  MagnifyingGlass,
  PaperPlaneTilt,
  Prohibit,
  SlidersHorizontal,
  SpinnerGap,
  Tray,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { Prospect, SendStatus, Service } from "@/lib/types";
import { useActiveService } from "@/components/service-context";
import { BTN_SECONDARY, CARD } from "@/components/ui-kit";

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
  scheduled: "予約済",
  sent: "送信済",
  failed: "送信失敗",
  replied: "返信あり",
  meeting: "商談中",
  rejected: "見送り",
};

const STATUS_STYLES: Record<SendStatus, string> = {
  unsent: "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400",
  scheduled: "bg-(--color-primary-light) text-(--color-primary)",
  sent: "bg-(--color-primary-light) text-(--color-primary)",
  failed: "bg-(--color-danger-light) text-(--color-danger)",
  replied: "bg-(--color-success-light) text-(--color-success)",
  meeting: "bg-(--color-warning-light) text-(--color-warning)",
  rejected: "bg-(--color-danger-light) text-(--color-danger)",
};

/** 状態は「色＋アイコン＋日本語」の3点セットで示す（IA-DESIGN §5-4） */
const STATUS_ICONS: Record<SendStatus, ComponentType<IconProps>> = {
  unsent: FileDashed,
  scheduled: CalendarCheck,
  sent: PaperPlaneTilt,
  failed: WarningCircle,
  replied: ChatCircleDots,
  meeting: Handshake,
  rejected: XCircle,
};

/** チップの並び。作った順（未送信→予約→送信）から結果（返信→商談→見送り→失敗）へ */
const STATUS_ORDER: SendStatus[] = [
  "unsent",
  "scheduled",
  "sent",
  "replied",
  "meeting",
  "rejected",
  "failed",
];

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30 };

/** UTC保存の scheduled_at をローカル表記にする */
function formatScheduledAt(s: string | null): string {
  if (!s) return "";
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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

function isKnownStatus(value: string): value is SendStatus {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, value);
}

export default function HistoryPage() {
  const { activeServiceId } = useActiveService();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterCompat, setFilterCompat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  // null = まだ自分で選んでいない（上部バーの商材が初期値になる）
  const [filterService, setFilterService] = useState<string | null>(null);
  const [filterPeriod, setFilterPeriod] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sentCountsByDomain, setSentCountsByDomain] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [prospectsRes, servicesRes, sendCountsRes] = await Promise.all([
          fetch("/api/prospects"),
          fetch("/api/services"),
          fetch("/api/prospects/send-counts"),
        ]);
        if (!prospectsRes.ok) throw new Error("履歴の取得に失敗しました。");
        const prospectsData: Prospect[] = await prospectsRes.json();
        const servicesData: Service[] = servicesRes.ok ? await servicesRes.json() : [];
        const sendCountsData: Record<string, number> = sendCountsRes.ok ? await sendCountsRes.json() : {};
        if (!cancelled) {
          setProspects(prospectsData);
          setServices(servicesData);
          setSentCountsByDomain(sendCountsData);
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

  useEffect(() => {
    // ホームの状況カード（?status=scheduled 等）から来たときは、その状態チップを選んでおく。
    // useSearchParams は使わない（Suspense 境界が要る／login と同じ方針）。読むだけ・無ければ「すべて」
    try {
      const value = new URLSearchParams(window.location.search).get("status");
      if (value && isKnownStatus(value)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFilterStatus(value);
      }
    } catch {
      /* クエリが壊れていても既定（すべて）で開く */
    }
  }, []);

  const serviceNameMap = useMemo(() => {
    const map = new Map<number, string>();
    services.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [services]);

  /** この宛先企業（ドメイン）へ通算何通送ったか（send_log 基準の実送信回数） */
  function sentCountFor(domain: string | null | undefined): number {
    return sentCountsByDomain[(domain || "").toLowerCase().trim()] ?? 0;
  }

  // 上部バーの商材を初期値にする。画面の select で手動上書きできる（すべて＝従来どおり）
  const filterServiceValue =
    filterService ??
    (activeServiceId !== null && services.some((s) => s.id === activeServiceId)
      ? String(activeServiceId)
      : "");

  /** 状態チップ以外の条件だけを掛けた集合。チップの件数はここから数える */
  const baseFiltered = useMemo(() => {
    const sorted = [...prospects].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const periodDays = PERIOD_DAYS[filterPeriod];
    // 期間の基準時刻はこの計算の中で1回だけ取る（行ごとにずれないように）
    const now = new Date();
    const todayKey = now.toDateString();
    return sorted.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = (p.company_name || "").toLowerCase().includes(q);
        const matchDomain = p.domain.toLowerCase().includes(q);
        const matchSubject = p.subject.toLowerCase().includes(q);
        if (!matchName && !matchDomain && !matchSubject) return false;
      }
      if (filterCompat && p.compatibility_score !== filterCompat) return false;
      if (filterServiceValue && p.service_id !== Number(filterServiceValue)) return false;
      if (filterPeriod) {
        const created = new Date(p.created_at);
        const time = created.getTime();
        // 日付が読めない行は隠さない（見落としを作らない）
        if (!Number.isNaN(time)) {
          if (filterPeriod === "today") {
            if (created.toDateString() !== todayKey) return false;
          } else if (periodDays && time < now.getTime() - periodDays * 24 * 60 * 60 * 1000) {
            return false;
          }
        }
      }
      return true;
    });
  }, [prospects, search, filterCompat, filterServiceValue, filterPeriod]);

  const filtered = useMemo(
    () => (filterStatus ? baseFiltered.filter((p) => p.send_status === filterStatus) : baseFiltered),
    [baseFiltered, filterStatus]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    baseFiltered.forEach((p) => {
      counts[p.send_status] = (counts[p.send_status] ?? 0) + 1;
    });
    return counts;
  }, [baseFiltered]);

  const hasActiveFilters = Boolean(filterCompat || filterServiceValue || filterPeriod);

  function clearFilters() {
    setFilterCompat("");
    setFilterService("");
    setFilterPeriod("");
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

  async function handleCancelSchedule(prospect: Prospect) {
    if (!confirm(`${prospect.company_name || prospect.domain} への予約送信を取り消しますか？（未送信に戻ります）`)) return;
    try {
      const res = await fetch(`/api/prospects/${prospect.id}/cancel-schedule`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "予約の取消に失敗しました");
        return;
      }
      setProspects((prev) =>
        prev.map((p) => (p.id === prospect.id ? { ...p, send_status: "unsent", scheduled_at: null } : p))
      );
    } catch {
      alert("予約の取消に失敗しました（通信エラー）");
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

  const chipBase =
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)";

  function chipClass(active: boolean) {
    return `${chipBase} ${
      active
        ? "border-(--color-primary) bg-(--color-primary) text-white"
        : "border-(--color-border) bg-(--color-card) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"
    }`;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
          className={BTN_SECONDARY}
        >
          <DownloadSimple size={14} />
          CSV出力
        </button>
      </div>

      {/* 状態チップ（旧ステータスselectの置き換え・7状態すべてを件数付きで常時表示） */}
      {!loading && prospects.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              aria-pressed={filterStatus === ""}
              onClick={() => setFilterStatus("")}
              className={chipClass(filterStatus === "")}
            >
              <ListChecks size={15} weight={filterStatus === "" ? "fill" : "regular"} />
              すべて {baseFiltered.length}件
            </button>
            {STATUS_ORDER.map((key) => {
              const active = filterStatus === key;
              const StatusIcon = STATUS_ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  // 押されているチップをもう一度押すと「すべて」に戻る（絞り込みの解除）
                  onClick={() => setFilterStatus(active ? "" : key)}
                  className={chipClass(active)}
                >
                  <StatusIcon size={15} weight={active ? "fill" : "regular"} />
                  {STATUS_LABELS[key]} {statusCounts[key] ?? 0}件
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="企業名・ドメイン・件名で検索"
                className="h-11 w-full rounded-lg border border-(--color-border) bg-(--color-card) pl-9 pr-3 text-sm text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
                showFilters || hasActiveFilters
                  ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)"
                  : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"
              }`}
            >
              <SlidersHorizontal size={14} />
              詳しい絞り込み
              {hasActiveFilters && (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-(--color-primary) text-[10px] font-bold text-white">
                  {[filterCompat, filterServiceValue, filterPeriod].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className={`${CARD} animate-fade-in grid grid-cols-1 gap-2 p-3 md:flex md:flex-wrap md:items-end md:gap-3`}>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-[12px] font-medium text-(--color-muted)">相性</label>
                <select value={filterCompat} onChange={(e) => setFilterCompat(e.target.value)} className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-2.5 text-[13px] text-(--color-foreground) focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25">
                  <option value="">すべて</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="mb-1 block text-[12px] font-medium text-(--color-muted)">サービス</label>
                <select value={filterServiceValue} onChange={(e) => setFilterService(e.target.value)} className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-2.5 text-[13px] text-(--color-foreground) focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25">
                  <option value="">すべて</option>
                  {services.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-[12px] font-medium text-(--color-muted)">期間</label>
                <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-2.5 text-[13px] text-(--color-foreground) focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25">
                  <option value="">すべて</option>
                  <option value="today">今日</option>
                  <option value="7d">7日以内</option>
                  <option value="30d">30日以内</option>
                </select>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) transition-colors motion-reduce:transition-none hover:border-(--color-danger) hover:text-(--color-danger)"
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
        <div className={`${CARD} flex flex-col items-center justify-center gap-3 py-20 text-center`}>
          <SpinnerGap size={20} className="animate-spin text-(--color-primary)" />
          <p className="text-sm text-(--color-muted)">読み込み中...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${CARD} flex flex-col items-center gap-3 px-6 py-20 text-center`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-card-hover) text-(--color-muted)">
            <Tray size={24} />
          </div>
          <p className="text-sm text-(--color-muted)">
            {prospects.length > 0 ? "条件に一致する履歴がありません" : "まだ生成履歴がありません。"}
          </p>
          {prospects.length === 0 && (
            <Link href="/generate" className={`${BTN_SECONDARY} mt-1`}>
              メールを作成する
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className={`${CARD} divide-y divide-(--color-border) overflow-hidden md:hidden`}>
            {filtered.map((prospect) => (
              <Link key={prospect.id} href={`/prospect/${prospect.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover)">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{prospect.company_name || prospect.domain}</span>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${COMPATIBILITY_STYLES[prospect.compatibility_score]}`}>
                      {COMPATIBILITY_LABELS[prospect.compatibility_score]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-(--color-muted)">{truncate(prospect.subject, 50)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-(--color-muted)">{formatDate(prospect.created_at)}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[prospect.send_status as SendStatus] ?? STATUS_STYLES.unsent}`}>
                      {STATUS_LABELS[prospect.send_status as SendStatus] ?? "未送信"}
                    </span>
                    {sentCountFor(prospect.domain) > 0 && (
                      <span className="inline-flex items-center rounded-full bg-(--color-primary-light) px-2 py-0.5 text-[10px] font-medium text-(--color-primary)">
                        この会社へ通算{sentCountFor(prospect.domain)}通
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight size={14} className="shrink-0 text-(--color-muted)" />
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className={`${CARD} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) bg-(--color-card-hover) text-left">
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
                        <td className="whitespace-nowrap px-4 py-3 text-(--color-muted)">
                          {formatDate(prospect.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {prospect.company_name || prospect.domain}
                          {sentCountFor(prospect.domain) > 0 && (
                            <span
                              title="この会社へ実際に送信した通算回数"
                              className="ml-2 inline-flex items-center rounded-full bg-(--color-primary-light) px-2 py-0.5 align-middle text-[10px] font-medium text-(--color-primary)"
                            >
                              通算{sentCountFor(prospect.domain)}通
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-(--color-muted)">
                          {serviceNameMap.get(prospect.service_id) ?? `#${prospect.service_id}`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COMPATIBILITY_STYLES[prospect.compatibility_score] ?? "bg-(--color-card-hover) text-(--color-muted)"}`}>
                            {COMPATIBILITY_LABELS[prospect.compatibility_score] ?? prospect.compatibility_score}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="relative inline-flex">
                            <select
                              value={(prospect.send_status as SendStatus) || "unsent"}
                              onChange={(e) => handleStatusChange(prospect.id, e.target.value as SendStatus)}
                              disabled={updatingStatusId === prospect.id}
                              className={`h-8 appearance-none rounded-full border-2 border-transparent bg-transparent py-0 pl-2.5 pr-6 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20 disabled:opacity-50 ${STATUS_STYLES[prospect.send_status as SendStatus] ?? STATUS_STYLES.unsent}`}
                            >
                              {(Object.entries(STATUS_LABELS) as [SendStatus, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <CaretDown size={10} weight="bold" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-(--color-muted)">
                          {prospect.send_status === "scheduled" && prospect.scheduled_at && (
                            <span className="mr-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded bg-(--color-primary-light) px-1.5 py-0.5 text-[10px] font-medium text-(--color-primary)">
                              <CalendarCheck size={11} weight="fill" />
                              {formatScheduledAt(prospect.scheduled_at)}
                            </span>
                          )}
                          {truncate(prospect.subject, 40)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {prospect.send_status === "scheduled" && (
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); handleCancelSchedule(prospect); }}
                                title="予約を取り消す（未送信に戻すだけ）"
                                className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-(--color-border) px-2.5 text-xs font-medium text-(--color-muted) transition-colors motion-reduce:transition-none hover:border-(--color-foreground) hover:text-(--color-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                              >
                                予約取消
                              </button>
                            )}
                            <Link
                              href={`/prospect/${prospect.id}`}
                              className="inline-flex h-11 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) px-3 text-xs font-medium transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:text-(--color-primary)"
                            >
                              詳細
                              <ArrowRight size={14} />
                            </Link>
                            {/* ここから先は「二度と送れなくなる」操作。区切って赤で隔離する */}
                            <span aria-hidden="true" className="mx-1 h-6 w-px bg-(--color-border)" />
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); handleSuppress(prospect); }}
                              disabled={suppressingDomain === prospect.domain}
                              aria-label="送信しないリストに追加"
                              title="この会社へ二度と送れなくなります"
                              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-(--color-danger)/40 text-(--color-danger) transition-colors motion-reduce:transition-none hover:bg-(--color-danger-light) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-danger) disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Prohibit size={15} weight="bold" />
                            </button>
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
