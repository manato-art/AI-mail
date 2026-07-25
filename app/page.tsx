"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AddressBook,
  ArrowRight,
  CalendarCheck,
  CaretDown,
  ChatCircleDots,
  Check,
  Globe,
  MagnifyingGlass,
  PaperPlaneRight,
  PaperPlaneTilt,
  PlugsConnected,
  ShieldWarning,
  SpinnerGap,
  Tray,
  Warning,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type {
  AnalysisResult,
  Persona,
  Prospect,
  QualityCheckResult,
  Service,
} from "@/lib/types";
import type { CollectionStatus } from "@/app/collection/types";
import { useActiveService } from "@/components/service-context";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, LABEL, SELECT } from "@/components/ui-kit";

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

interface SenderInfo {
  id: number;
  email: string;
  auth_status: string;
}

/**
 * 1本でも失敗したら画面全体が落ちる、を避けるための取得ヘルパー。
 * 落ちた分だけ既定値になり、その情報を使う表示（アラート等）が消えるだけにする。
 */
async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

interface AlertItem {
  key: string;
  Icon: ComponentType<IconProps>;
  message: string;
  href: string;
  action: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { activeServiceId } = useActiveService();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [senders, setSenders] = useState<SenderInfo[]>([]);
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus | null>(null);
  const [config, setConfig] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);

  const [quickUrl, setQuickUrl] = useState("");
  // null = まだ自分で選んでいない（上部バーの商材が初期値になる）
  const [quickServiceId, setQuickServiceId] = useState<string | null>(null);
  const [quickPersonaId, setQuickPersonaId] = useState("");
  const [quickStatus, setQuickStatus] = useState<QuickStatus>("idle");
  const [quickError, setQuickError] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);


  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pData, sData, perData, senderData, statusData, configData] = await Promise.all([
          getJson<Prospect[]>("/api/prospects", []),
          getJson<Service[]>("/api/services", []),
          getJson<Persona[]>("/api/personas", []),
          getJson<SenderInfo[]>("/api/senders", []),
          getJson<CollectionStatus | null>("/api/collection/status", null),
          getJson<Record<string, string> | null>("/api/settings", null),
        ]);
        if (!cancelled) {
          setProspects(Array.isArray(pData) ? pData : []);
          setServices(Array.isArray(sData) ? sData : []);
          setPersonas(Array.isArray(perData) ? perData : []);
          setSenders(Array.isArray(senderData) ? senderData : []);
          setCollectionStatus(statusData);
          setConfig(configData);
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

  /** 上部バーで商材を選んでいる間だけ、その商材の件数・履歴に絞る（すべて＝従来どおり） */
  const scopedProspects = useMemo(
    () =>
      activeServiceId === null
        ? prospects
        : prospects.filter((p) => p.service_id === activeServiceId),
    [prospects, activeServiceId]
  );

  const sorted = useMemo(
    () =>
      [...scopedProspects].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [scopedProspects]
  );

  const recentProspects = sorted.slice(0, 5);

  const serviceMap = useMemo(() => {
    const m = new Map<number, string>();
    services.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [services]);

  const scheduledCount = useMemo(
    () => scopedProspects.filter((p) => p.send_status === "scheduled").length,
    [scopedProspects]
  );
  // 商談へ進んだ件は数えない（返ってきたばかりの1次返信だけを「新しい返信」とする）
  const repliedCount = useMemo(
    () => scopedProspects.filter((p) => p.send_status === "replied").length,
    [scopedProspects]
  );

  const activeServiceName =
    activeServiceId === null ? null : serviceMap.get(activeServiceId) ?? null;

  const alerts: AlertItem[] = [];
  if (senders.some((s) => s.auth_status !== "connected")) {
    alerts.push({
      key: "reauth",
      Icon: PlugsConnected,
      message: "Gmailのつなぎ直しが必要なアカウントがあります。このままだと送信できません。",
      href: "/settings",
      action: "設定を開く",
    });
  }
  if (collectionStatus?.isLowStock) {
    alerts.push({
      key: "low-stock",
      Icon: Warning,
      message: `すぐ送れる宛先が残り約${collectionStatus.daysRemaining}日分です。宛先を増やしてください。`,
      href: "/collection",
      action: "宛先を集める",
    });
  }
  if (collectionStatus && collectionStatus.pausedSources.length > 0) {
    alerts.push({
      key: "paused",
      Icon: Warning,
      message: `自動で集める設定が${collectionStatus.pausedSources.length}件止まっています。`,
      href: "/collection",
      action: "自動収集を見る",
    });
  }
  if (config && config.auth_enabled !== "true") {
    alerts.push({
      key: "auth",
      Icon: ShieldWarning,
      message: "アクセス保護が無効です。URLを知っている人は誰でもこの画面を開けます。",
      href: "/settings",
      action: "設定を開く",
    });
  }

  const statusCards: Array<{
    key: string;
    Icon: ComponentType<IconProps>;
    label: string;
    value: string;
    note: string;
    href: string;
  }> = [
    {
      key: "ready",
      Icon: AddressBook,
      label: "すぐ送れる宛先",
      value: collectionStatus ? `${collectionStatus.readyCount}社` : "—",
      note: collectionStatus
        ? `残り約${collectionStatus.daysRemaining}日分（全商材合計）`
        : "在庫を取得できませんでした",
      href: "/collection/companies",
    },
    {
      key: "pending",
      Icon: MagnifyingGlass,
      label: "準備中",
      value: collectionStatus ? `${collectionStatus.pendingEnrichment}社` : "—",
      note: "メールアドレスを調べている途中（全商材合計）",
      href: "/collection/companies?status=pending",
    },
    {
      key: "scheduled",
      Icon: CalendarCheck,
      label: "予約中",
      value: `${scheduledCount}件`,
      note: "送る時刻を決めて待っているメール",
      href: "/history?status=scheduled",
    },
    {
      key: "replied",
      Icon: ChatCircleDots,
      label: "新しい返信",
      value: `${repliedCount}件`,
      note: "返信ありのメール（商談中は履歴で見る）",
      href: "/history?status=replied",
    },
  ];

  const isBusy = quickStatus === "crawling" || quickStatus === "analyzing" || quickStatus === "generating";

  // 上部バーの商材を初期値にする。手で選んだらそちらが勝つ（APIへ送る値は常にこのselectの値）
  const quickServiceValue =
    quickServiceId ??
    (activeServiceId !== null && services.some((s) => s.id === activeServiceId)
      ? String(activeServiceId)
      : "");

  const canQuickSubmit =
    !isBusy &&
    quickStatus !== "done" &&
    Boolean(quickServiceValue) &&
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
          serviceId: Number(quickServiceValue),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.key}
              className="flex flex-col gap-2 rounded-xl border border-(--color-danger)/40 bg-(--color-danger-light) p-3.5 sm:flex-row sm:items-center"
            >
              <alert.Icon
                size={18}
                weight="fill"
                className="shrink-0 text-(--color-danger)"
              />
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-(--color-danger)">
                {alert.message}
              </p>
              <Link
                href={alert.href}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-(--color-danger)/40 bg-(--color-card) px-3.5 text-[13px] font-semibold text-(--color-danger) transition-colors motion-reduce:transition-none hover:bg-(--color-danger-light) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-danger)"
              >
                {alert.action}
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* 今日の状況（左から 集める→作る→送る→返ってくる の順） */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statusCards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`${CARD} group flex min-h-11 flex-col gap-1 p-4 transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:bg-(--color-card-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)`}
          >
            <span className="flex items-center gap-2 text-[13px] font-medium text-(--color-muted)">
              <card.Icon size={16} weight="duotone" className="shrink-0 text-(--color-primary)" />
              {card.label}
            </span>
            <span className="text-2xl font-bold tabular-nums tracking-tight">{card.value}</span>
            <span className="text-[12px] leading-relaxed text-(--color-muted)">{card.note}</span>
          </Link>
        ))}
      </div>

      {/* いちばん使う道（ヒーロー） */}
      <div className={`${CARD} flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between`}>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-balance">今日の営業をはじめる</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-(--color-muted)">
            まとめて送るときはこちら。送る相手は次の画面で自分で選びます。
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {/* 画面内でいちばん大きい青ボタン（1画面1主目的・IA-DESIGN §5-1） */}
          <Link
            href="/bulk-send"
            className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-6 text-base font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-(--color-primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-background)"
          >
            <PaperPlaneRight size={18} weight="fill" />
            一括送信をはじめる
          </Link>
          <Link href="/generate" className={BTN_SECONDARY}>
            1社だけ作る
          </Link>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">クイック生成</h2>
          <Link
            href="/generate"
            className="text-[13px] text-(--color-primary) underline-offset-2 hover:underline"
          >
            詳細フォームへ
          </Link>
        </div>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
          <div>
            <label htmlFor="quick-service" className={LABEL}>
              サービス
            </label>
            <div className="relative">
              <select
                id="quick-service"
                value={quickServiceValue}
                onChange={(e) => setQuickServiceId(e.target.value)}
                disabled={isBusy}
                className={`${SELECT} disabled:opacity-50`}
              >
                <option value="">選択</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <CaretDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
                size={14}
                weight="bold"
              />
            </div>
          </div>
          <div>
            <label htmlFor="quick-persona" className={LABEL}>
              人格
            </label>
            <div className="relative">
              <select
                id="quick-persona"
                value={quickPersonaId}
                onChange={(e) => setQuickPersonaId(e.target.value)}
                disabled={isBusy}
                className={`${SELECT} disabled:opacity-50`}
              >
                <option value="">選択</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <CaretDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
                size={14}
                weight="bold"
              />
            </div>
          </div>
          <div>
            <label htmlFor="quick-url" className={LABEL}>
              企業URL
            </label>
            <div className="relative">
              <Globe
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
              />
              <input
                id="quick-url"
                type="url"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                disabled={isBusy}
                placeholder="https://example.co.jp"
                className="h-11 w-full rounded-lg border border-(--color-border) bg-(--color-card) pl-9 pr-3 text-sm text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25 disabled:opacity-50"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickGenerate}
            disabled={!canQuickSubmit}
            className={`${BTN_PRIMARY} w-full whitespace-nowrap md:w-auto`}
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
          <div className="animate-fade-in mt-4 flex gap-2.5 rounded-lg border border-(--color-danger)/40 bg-(--color-danger-light) p-3.5 text-sm text-(--color-danger)">
            <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{quickError}</p>
              <button
                type="button"
                onClick={handleQuickGenerate}
                className="mt-2 cursor-pointer text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                再試行
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-3 border-b border-(--color-border) px-5 py-4">
          <h2 className="text-base font-semibold">
            最近の生成
            {activeServiceName && (
              <span className="ml-2 text-[12px] font-medium text-(--color-muted)">
                （{activeServiceName}）
              </span>
            )}
          </h2>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-[13px] text-(--color-primary) underline-offset-2 hover:underline"
          >
            すべて見る
            <ArrowRight size={12} />
          </Link>
        </div>

        {recentProspects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-card-hover) text-(--color-muted)">
              <Tray size={24} />
            </div>
            <p className="text-sm text-(--color-muted)">
              まだ生成履歴がありません。
            </p>
            <Link href="/generate" className={`${BTN_SECONDARY} mt-1`}>
              メールを作成する
            </Link>
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="md:hidden">
            {recentProspects.map((prospect) => (
              <div key={prospect.id} className="border-b border-(--color-border) px-4 py-3 last:border-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{prospect.company_name || prospect.domain}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      COMPATIBILITY_STYLES[prospect.compatibility_score] ??
                      "bg-(--color-card-hover) text-(--color-muted)"
                    }`}
                  >
                    {COMPATIBILITY_LABELS[prospect.compatibility_score] ??
                      prospect.compatibility_score}
                  </span>
                </div>
                <p className="truncate text-xs text-(--color-muted)">{prospect.subject}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-(--color-muted)">
                    {formatDate(prospect.created_at)} · {serviceMap.get(prospect.service_id) ?? `#${prospect.service_id}`}
                  </span>
                  <Link href={`/prospect/${prospect.id}`} className="text-xs font-medium text-(--color-primary)">
                    詳細 →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) bg-(--color-card-hover) text-left">
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
                    <td className="whitespace-nowrap px-5 py-3 text-(--color-muted)">
                      {formatDate(prospect.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-medium">
                      {prospect.company_name || prospect.domain}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-(--color-muted)">
                      {serviceMap.get(prospect.service_id) ??
                        `#${prospect.service_id}`}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          COMPATIBILITY_STYLES[prospect.compatibility_score] ??
                          "bg-(--color-card-hover) text-(--color-muted)"
                        }`}
                      >
                        {COMPATIBILITY_LABELS[prospect.compatibility_score] ??
                          prospect.compatibility_score}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-(--color-muted)">
                      {truncate(prospect.subject, 40)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Link
                        href={`/prospect/${prospect.id}`}
                        className="inline-flex h-11 items-center gap-1 rounded-lg border border-(--color-border) px-3 text-xs font-medium transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:text-(--color-primary)"
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
          </>
        )}
      </div>
    </div>
  );
}

function QuickProgressBar({ status }: { status: QuickStatus }) {
  const currentStep = QUICK_STEPS.find((s) => s.key === status);
  const pct = currentStep?.pct ?? 0;

  return (
    <div className="animate-fade-in mt-4">
      <div className="mb-2 flex items-center justify-between">
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
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-(--color-border)" />
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
      <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-card-hover)">
        <div
          className="h-full rounded-full bg-(--color-primary) transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
