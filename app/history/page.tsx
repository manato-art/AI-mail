"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Prospect, Service } from "@/lib/types";

const COMPATIBILITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const COMPATIBILITY_STYLES: Record<string, string> = {
  high: "bg-green-100 text-[--color-success]",
  medium: "bg-amber-100 text-[--color-warning]",
  low: "bg-red-100 text-[--color-danger]",
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
    <div>
      <h1 className="text-2xl font-bold mb-6">生成履歴</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-[--color-danger] bg-red-50 p-4 text-sm text-[--color-danger]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : sortedProspects.length === 0 ? (
        <p className="text-gray-500">まだ生成履歴がありません。</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--color-border] text-left text-gray-500">
                <th className="px-4 py-3 font-medium whitespace-nowrap">
                  日付
                </th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">
                  会社名
                </th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">
                  サービス
                </th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">
                  相性
                </th>
                <th className="px-4 py-3 font-medium">件名</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap" />
              </tr>
            </thead>
            <tbody>
              {sortedProspects.map((prospect) => (
                <tr
                  key={prospect.id}
                  className="border-b border-[--color-border] last:border-0 hover:bg-[--color-card-hover]"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {formatDate(prospect.created_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {prospect.company_name || prospect.domain}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {serviceNameMap.get(prospect.service_id) ??
                      `#${prospect.service_id}`}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        COMPATIBILITY_STYLES[prospect.compatibility_score] ??
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {COMPATIBILITY_LABELS[prospect.compatibility_score] ??
                        prospect.compatibility_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {truncate(prospect.subject, 40)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <Link
                      href={`/prospect/${prospect.id}`}
                      className="text-[--color-primary] hover:underline underline-offset-2 font-medium"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
