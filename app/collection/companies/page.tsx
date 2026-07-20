"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  EnvelopeSimple,
  Hourglass,
  SpinnerGap,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import type { Company, Contact } from "@/lib/types";
import { ActivityLogPanel } from "../activity-log-panel";

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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "done" | "pending" | "failed">(
    "all",
  );
  const [reEnriching, setReEnriching] = useState(false);

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
      }
    } catch {
      /* load on next refresh */
    } finally {
      setReEnriching(false);
    }
  }, [load]);

  const filtered =
    filter === "all"
      ? companies
      : companies.filter((c) => c.enrichment_status === filter);

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

      <div className="flex gap-2">
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
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{company.name}</p>
                        {company.hp_url && (
                          <p className="mt-0.5 truncate text-[11px] text-(--color-muted) max-w-[250px]">
                            {company.domain || company.hp_url}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-(--color-muted)">
                      {email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-(--color-card) px-2 py-0.5 text-[11px] text-(--color-muted)">
                        {SOURCE_LABELS[company.source] ?? company.source}
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

      <ActivityLogPanel />
    </div>
  );
}
