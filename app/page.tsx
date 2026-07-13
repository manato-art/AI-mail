"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EnvelopeSimple,
  TrendUp,
  Handshake,
  Briefcase,
  ArrowRight,
  PaperPlaneTilt,
  Globe,
  CaretDown,
  SpinnerGap,
  Tray,
  Check,
  Warning,
  PencilSimple,
  FloppyDisk,
} from "@phosphor-icons/react";
import type {
  AnalysisResult,
  Persona,
  Prospect,
  QualityCheckResult,
  Service,
} from "@/lib/types";

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

type QuickStatus = "idle" | "crawling" | "analyzing" | "generating" | "done" | "error" | "duplicate" | "low-compat";

const QUICK_STEPS = [
  { key: "crawling", label: "企業HPを取得中", pct: 15 },
  { key: "analyzing", label: "企業を分析中", pct: 50 },
  { key: "generating", label: "メールを作成中", pct: 85 },
  { key: "done", label: "完了", pct: 100 },
] as const;

const STEP_DELAY_MS = 2200;

interface GenerateSuccessResponse {
  prospect: Prospect;
  qualityCheck: QualityCheckResult;
}
interface DuplicateResponse {
  duplicate: true;
  existingProspect: Prospect;
}
interface LowCompatibilityResponse {
  lowCompatibility: true;
  analysis: AnalysisResult;
}
interface ErrorResponse {
  error: string;
}
type GenerateResponse =
  | GenerateSuccessResponse
  | DuplicateResponse
  | LowCompatibilityResponse
  | ErrorResponse;

export default function DashboardPage() {
  const router = useRouter();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  const [quickUrl, setQuickUrl] = useState("");
  const [quickServiceId, setQuickServiceId] = useState("");
  const [quickPersonaId, setQuickPersonaId] = useState("");
  const [quickStatus, setQuickStatus] = useState<QuickStatus>("idle");
  const [quickError, setQuickError] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [senderEmail, setSenderEmail] = useState("");
  const [editingSender, setEditingSender] = useState(false);
  const [senderDraft, setSenderDraft] = useState("");
  const [savingSender, setSavingSender] = useState(false);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pRes, sRes, perRes, settingsRes] = await Promise.all([
          fetch("/api/prospects"),
          fetch("/api/services"),
          fetch("/api/personas"),
          fetch("/api/settings"),
        ]);
        const pData: Prospect[] = pRes.ok ? await pRes.json() : [];
        const sData: Service[] = sRes.ok ? await sRes.json() : [];
        const perData: Persona[] = perRes.ok ? await perRes.json() : [];
        const settingsData = settingsRes.ok ? await settingsRes.json() : {};
        if (!cancelled) {
          setProspects(pData);
          setServices(sData);
          setPersonas(perData);
          if (settingsData.sender_email) setSenderEmail(settingsData.sender_email);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(
    () =>
      [...prospects].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [prospects]
  );

  const recentProspects = sorted.slice(0, 5);

  const serviceMap = useMemo(() => {
    const m = new Map<number, string>();
    services.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [services]);

  const now = new Date();
  const thisMonth = sorted.filter((p) => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalCount = prospects.length;
  const monthCount = thisMonth.length;
  const highCompatRate =
    totalCount > 0
      ? Math.round(
          (prospects.filter((p) => p.compatibility_score === "high").length /
            totalCount) *
            100
        )
      : 0;
  const serviceCount = services.length;

  async function handleSaveSender() {
    setSavingSender(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_email: senderDraft }),
      });
      if (res.ok) {
        const data = await res.json();
        setSenderEmail(data.sender_email);
        setEditingSender(false);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingSender(false);
    }
  }

  const isBusy = quickStatus === "crawling" || quickStatus === "analyzing" || quickStatus === "generating";

  const canQuickSubmit =
    !isBusy &&
    quickStatus !== "done" &&
    Boolean(quickServiceId) &&
    Boolean(quickPersonaId) &&
    Boolean(quickUrl.trim());

  async function handleQuickGenerate() {
    if (!canQuickSubmit) return;
    setQuickError(null);
    setQuickStatus("crawling");

    const t1 = setTimeout(() => setQuickStatus("analyzing"), STEP_DELAY_MS);
    const t2 = setTimeout(() => setQuickStatus("generating"), STEP_DELAY_MS * 2);
    timersRef.current.push(t1, t2);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: Number(quickServiceId),
          personaId: Number(quickPersonaId),
          url: quickUrl.trim(),
          force: false,
          forceLow: false,
        }),
      });

      clearTimeout(t1);
      clearTimeout(t2);

      const data: GenerateResponse = await res.json();

      if (!res.ok) {
        setQuickStatus("error");
        setQuickError(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "生成に失敗しました。"
        );
        return;
      }

      if ("duplicate" in data && data.duplicate) {
        setQuickStatus("done");
        router.push(`/prospect/${(data as DuplicateResponse).existingProspect.id}`);
        return;
      }

      if ("lowCompatibility" in data && data.lowCompatibility) {
        setQuickStatus("idle");
        router.push(`/generate?url=${encodeURIComponent(quickUrl.trim())}`);
        return;
      }

      if ("prospect" in data) {
        setQuickStatus("done");
        router.push(`/prospect/${(data as GenerateSuccessResponse).prospect.id}`);
        return;
      }

      setQuickStatus("error");
      setQuickError("予期しない応答です。");
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setQuickStatus("error");
      setQuickError(
        err instanceof Error ? err.message : "通信エラーが発生しました。"
      );
    }
  }

  const metrics = [
    {
      label: "総生成数",
      value: totalCount,
      icon: EnvelopeSimple,
      color: "text-(--color-primary)",
      bg: "bg-(--color-primary-light)",
    },
    {
      label: "今月の生成",
      value: monthCount,
      icon: TrendUp,
      color: "text-(--color-success)",
      bg: "bg-(--color-success-light)",
    },
    {
      label: "高相性率",
      value: `${highCompatRate}%`,
      icon: Handshake,
      color: "text-(--color-warning)",
      bg: "bg-(--color-warning-light)",
    },
    {
      label: "サービス数",
      value: serviceCount,
      icon: Briefcase,
      color: "text-(--color-muted)",
      bg: "bg-gray-100 dark:bg-slate-700",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-(--color-border) bg-(--color-card) p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${m.bg}`}
              >
                <m.icon size={20} weight="duotone" className={m.color} />
              </div>
              <div>
                <p className="text-xs text-(--color-muted)">{m.label}</p>
                <p className="text-xl font-bold tracking-tight">{m.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-card) px-5 py-3">
        <EnvelopeSimple size={16} className="shrink-0 text-(--color-muted)" />
        <span className="shrink-0 text-xs font-medium text-(--color-muted)">送信元</span>
        {editingSender ? (
          <>
            <input
              type="email"
              value={senderDraft}
              onChange={(e) => setSenderDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveSender(); if (e.key === "Escape") setEditingSender(false); }}
              className="h-8 flex-1 rounded-lg border border-(--color-border) px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent"
              placeholder="example@gmail.com"
            />
            <button
              type="button"
              onClick={handleSaveSender}
              disabled={savingSender}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 text-xs font-semibold text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
            >
              <FloppyDisk size={14} />
              保存
            </button>
            <button
              type="button"
              onClick={() => setEditingSender(false)}
              className="h-8 cursor-pointer rounded-lg border border-(--color-border) px-3 text-xs font-medium text-(--color-muted) hover:bg-(--color-card-hover)"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-sm">
              {senderEmail || <span className="text-(--color-muted)">未設定</span>}
            </span>
            <button
              type="button"
              onClick={() => { setSenderDraft(senderEmail); setEditingSender(true); }}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) px-3 text-xs font-medium text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"
            >
              <PencilSimple size={13} />
              変更
            </button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-(--color-border) bg-(--color-card) p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">クイック生成</h2>
          <Link
            href="/generate"
            className="text-xs text-(--color-primary) hover:underline underline-offset-2"
          >
            詳細フォームへ
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-1">
              サービス
            </label>
            <div className="relative">
              <select
                value={quickServiceId}
                onChange={(e) => setQuickServiceId(e.target.value)}
                disabled={isBusy}
                className="w-full h-10 px-3 pr-8 border border-(--color-border) rounded-lg bg-white dark:bg-slate-800 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50"
              >
                <option value="">選択</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <CaretDown
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
                size={14}
                weight="bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-1">
              人格
            </label>
            <div className="relative">
              <select
                value={quickPersonaId}
                onChange={(e) => setQuickPersonaId(e.target.value)}
                disabled={isBusy}
                className="w-full h-10 px-3 pr-8 border border-(--color-border) rounded-lg bg-white dark:bg-slate-800 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50"
              >
                <option value="">選択</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <CaretDown
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
                size={14}
                weight="bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-1">
              企業URL
            </label>
            <div className="relative">
              <Globe
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="url"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                disabled={isBusy}
                placeholder="https://example.co.jp"
                className="w-full h-10 pl-9 pr-3 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickGenerate}
            disabled={!canQuickSubmit}
            className="h-10 px-5 rounded-lg bg-(--color-primary) hover:bg-(--color-primary-hover) text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
          >
            {isBusy ? (
              <SpinnerGap size={16} className="animate-spin" />
            ) : (
              <PaperPlaneTilt size={16} weight="fill" />
            )}
            生成
          </button>
        </div>

        {isBusy && <QuickProgressBar status={quickStatus} />}

        {quickStatus === "error" && quickError && (
          <div className="mt-4 flex gap-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-3.5 text-sm text-(--color-danger) animate-fade-in">
            <Warning size={18} weight="fill" className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p>{quickError}</p>
              <button
                type="button"
                onClick={handleQuickGenerate}
                className="mt-2 text-xs font-medium underline underline-offset-2 hover:no-underline cursor-pointer"
              >
                再試行
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-(--color-border) bg-(--color-card)">
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border)">
          <h2 className="text-base font-semibold">最近の生成</h2>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-xs text-(--color-primary) hover:underline underline-offset-2"
          >
            すべて見る
            <ArrowRight size={12} />
          </Link>
        </div>

        {recentProspects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-400">
              <Tray size={24} />
            </div>
            <p className="text-sm text-(--color-muted)">
              まだ生成履歴がありません。
            </p>
            <Link
              href="/generate"
              className="mt-1 inline-flex h-9 items-center rounded-lg border border-(--color-border) px-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover) cursor-pointer"
            >
              メールを作成する
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) bg-gray-50 dark:bg-slate-700/50 text-left">
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    日付
                  </th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    会社名
                  </th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    サービス
                  </th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    相性
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                    件名
                  </th>
                  <th className="whitespace-nowrap px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {recentProspects.map((prospect) => (
                  <tr
                    key={prospect.id}
                    className="border-b border-(--color-border) last:border-0 hover:bg-(--color-card-hover)"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-gray-600 dark:text-gray-400">
                      {formatDate(prospect.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {prospect.company_name || prospect.domain}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-600 dark:text-gray-400">
                      {serviceMap.get(prospect.service_id) ??
                        `#${prospect.service_id}`}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
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
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                      {truncate(prospect.subject, 40)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Link
                        href={`/prospect/${prospect.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-(--color-border) px-3 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover) hover:text-(--color-primary) cursor-pointer"
                      >
                        詳細
                        <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickProgressBar({ status }: { status: QuickStatus }) {
  const currentStep = QUICK_STEPS.find((s) => s.key === status);
  const pct = currentStep?.pct ?? 0;

  return (
    <div className="mt-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {QUICK_STEPS.slice(0, 3).map((step) => {
            const stepIdx = QUICK_STEPS.findIndex((s) => s.key === step.key);
            const currentIdx = QUICK_STEPS.findIndex((s) => s.key === status);
            const isDone = currentIdx > stepIdx;
            const isCurrent = step.key === status;
            return (
              <div key={step.key} className="flex items-center gap-1.5">
                {isDone ? (
                  <Check size={14} weight="bold" style={{ color: "var(--color-success)" }} />
                ) : isCurrent ? (
                  <SpinnerGap size={14} className="animate-spin text-(--color-primary)" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                )}
                <span className={`text-xs ${isCurrent ? "font-semibold text-(--color-primary)" : isDone ? "text-(--color-success)" : "text-(--color-muted)"}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        <span className="text-xs tabular-nums text-(--color-muted)">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-(--color-primary) transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
