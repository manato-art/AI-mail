"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, SpinnerGap, Tray } from "@phosphor-icons/react";
import type { Prospect, Service } from "@/lib/types";

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
        const servicesData: Service[] = servicesRes.ok
          ? await servicesRes.json()
          : [];
        if (!cancelled) {
          setProspects(prospectsData);
          setServices(servicesData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "履歴の取得に失敗しました。"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const serviceNameMap = useMemo(() => {
    const map = new Map<number, string>();
    services.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [services]);

  const sortedProspects = useMemo(
    () =>
      [...prospects].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [prospects]
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">生成履歴</h1>
        {!loading && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-(--color-primary-light) px-2 text-xs font-semibold text-(--color-primary)">
            {sortedProspects.length}
          </span>
        )}
      </div>

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
      ) : sortedProspects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-card) px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500">
            <Tray size={24} />
          </div>
          <p className="text-sm text-(--color-muted)">
            まだ生成履歴がありません。
          </p>
          <Link
            href="/generate"
            className="mt-1 inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--color-border) px-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover)"
          >
            メールを作成する
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) bg-gray-50 dark:bg-slate-700/50 text-left">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    日付
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    会社名
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    サービス
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    相性
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    件名
                  </th>
                  <th className="whitespace-nowrap px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedProspects.map((prospect) => (
                  <tr
                    key={prospect.id}
                    className="border-b border-(--color-border) last:border-0 hover:bg-(--color-card-hover)"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                      {formatDate(prospect.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {prospect.company_name || prospect.domain}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                      {serviceNameMap.get(prospect.service_id) ??
                        `#${prospect.service_id}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          COMPATIBILITY_STYLES[prospect.compatibility_score] ??
                          "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {COMPATIBILITY_LABELS[prospect.compatibility_score] ??
                          prospect.compatibility_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {truncate(prospect.subject, 40)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/prospect/${prospect.id}`}
                        className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) px-3 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover) hover:text-(--color-primary)"
                      >
                        詳細
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
