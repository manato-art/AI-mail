"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  ArrowClockwise,
  Key,
  LinkSimple,
  ListPlus,
  Play,
  Plus,
  Sparkle,
  SpinnerGap,
  Stack,
  Trash,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { CollectionRun, CollectionSource, Service } from "@/lib/types";
import { Toast } from "@/components/toast";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Card,
  FIELD,
  ICON_BTN_DANGER,
} from "@/components/ui-kit";

/**
 * 追加フォームの商材タグ select。appearance は既定のままにして
 * OS標準の▼を出す（「選ぶもの」だと一目で分かるようにする）。
 */
const FORM_SELECT =
  "h-11 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25";
import { ActivityLogPanel } from "./activity-log-panel";
import { InventoryPanel } from "./inventory-panel";
import type { CollectionStatus, SourcesResponse } from "./types";

/** 画面を開いている間の自動更新間隔。裏で進む処理の結果を反映する */
const REFRESH_INTERVAL_MS = 30 * 1000;
/** 収集中はこの間隔で状態を更新する */
const RUNNING_POLL_MS = 5 * 1000;

const RUN_STATUS_LABELS: Record<string, string> = {
  success: "新規あり",
  no_new: "新規なし",
  no_result: "結果0件",
  error: "エラー",
};

const RUN_STATUS_STYLES: Record<string, string> = {
  success: "bg-(--color-success-light) text-(--color-success-text)",
  no_new: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300",
  no_result: "bg-(--color-danger-light) text-(--color-danger-text)",
  error: "bg-(--color-danger-light) text-(--color-danger-text)",
};

/**
 * 収集元の「集め方（方式）」を一目で分かるバッジにする。今どの方式で回っているかの混乱を防ぐ。
 * アイコンは phosphor のみ（絵文字をアイコン代わりにしない・IA-DESIGN §3.3）。
 */
function sourceMethod(sourceType: string): {
  label: string;
  hint: string;
  cls: string;
  Icon: ComponentType<IconProps>;
} {
  if (sourceType === "wantedly_direct") {
    return {
      label: "Wantedly新着",
      hint: "Wantedlyの新着を毎回取得",
      cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
      Icon: Sparkle,
    };
  }
  if (sourceType === "wantedly_url") {
    return {
      label: "URL巡回",
      hint: "貼り付けたページを毎回巡回",
      cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
      Icon: LinkSimple,
    };
  }
  return {
    label: "キーワード常時",
    hint: "検索エンジンで毎回この条件を検索",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Icon: Key,
  };
}

/** 方式バッジ（アイコン＋日本語ラベル） */
function MethodBadge({ sourceType }: { sourceType: string }) {
  const m = sourceMethod(sourceType);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${m.cls}`}
      title={m.hint}
    >
      <m.Icon size={12} weight="bold" />
      {m.label}
    </span>
  );
}

function CompactStat({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "warning";
}) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-card) px-4 py-3">
      <p className="text-[13px] text-(--color-muted)">{label}</p>
      <p
        className={`mt-0.5 text-2xl font-bold tabular-nums ${tone === "warning" ? "text-(--color-warning-text)" : ""}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[12px] leading-relaxed text-(--color-muted)">{hint}</p>}
    </div>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  let iso = value.replace(" ", "T");
  if (!/[Z+]/.test(iso) && !/T\d{2}:\d{2}:\d{2}[+-]/.test(iso)) {
    iso += "Z";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CollectionPage() {
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [sources, setSources] = useState<CollectionSource[]>([]);
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [site, setSite] = useState("");
  const [serviceId, setServiceId] = useState<number | "">("");
  const [services, setServices] = useState<Service[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingWantedly, setAddingWantedly] = useState(false);
  const [wantedlyUrl, setWantedlyUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [noSourceError, setNoSourceError] = useState(false);


  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  const load = useCallback(async () => {
    try {
      const [statusRes, sourcesRes, servicesRes] = await Promise.all([
        fetch("/api/collection/status"),
        fetch("/api/collection/sources"),
        fetch("/api/services"),
      ]);
      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(Array.isArray(data.services) ? data.services : data);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
        setJobRunning(data.isRunning);
      }
      if (sourcesRes.ok) {
        const data: SourcesResponse = await sourcesRes.json();
        setSources(data.sources);
        setRuns(data.runs);
      }
    } catch {
      /* 一時的な失敗は次の更新で回復する */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const interval = jobRunning ? RUNNING_POLL_MS : REFRESH_INTERVAL_MS;
    const timer = setInterval(load, interval);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load, jobRunning]);


  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !keyword.trim()) return;

    // URLをキーワード欄に入れる誤用を防ぐ（`site:東京 https://…` のような無効検索になり永久に0件になる）
    const kw = keyword.trim();
    if (/^https?:\/\//i.test(kw) || /\b[\w-]+\.[a-z]{2,}\/\S/i.test(kw)) {
      showToast(
        "キーワード欄にURLは入れないでください。特定サイトを対象にするなら『検索元サイト』欄にドメイン（例: 01intern.com）を、WantedlyのページURLなら上の貼り付け欄をお使いください。"
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/collection/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, site, service_id: serviceId === "" ? null : serviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "登録に失敗しました");
        return;
      }
      setKeyword("");
      setSite("");
      setServiceId("");
      setNoSourceError(false);
      showToast("キーワードを追加しました。次回の収集から対象になります");
      load();
    } catch {
      showToast("登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const hasWantedlySource = sources.some(
    (s) => s.source_type === "wantedly_direct",
  );

  async function handleAddWantedly() {
    if (addingWantedly) return;
    setAddingWantedly(true);
    try {
      const res = await fetch("/api/collection/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: "wantedly_direct" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "登録に失敗しました");
        return;
      }
      showToast("Wantedlyを収集元に追加しました");
      load();
    } catch {
      showToast("登録に失敗しました");
    } finally {
      setAddingWantedly(false);
    }
  }

  async function handleAddUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = wantedlyUrl.trim();
    if (!url || addingUrl) return;
    setAddingUrl(true);
    try {
      const res = await fetch("/api/collection/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "wantedly_url",
          url,
          service_id: serviceId === "" ? null : serviceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "登録に失敗しました");
        return;
      }
      setWantedlyUrl("");
      showToast("URLを収集元に追加しました。次回の収集からこのURLのページを巡回します");
      load();
    } catch {
      showToast("登録に失敗しました");
    } finally {
      setAddingUrl(false);
    }
  }

  const hasActiveSources = sources.some(
    (s) => s.is_active === 1 && !s.paused_kind,
  );

  async function handleRunNow() {
    if (running) return;
    if (!hasActiveSources) {
      setNoSourceError(true);
      return;
    }
    setNoSourceError(false);
    setRunning(true);
    try {
      const res = await fetch("/api/collection/run", { method: "POST" });
      const data = await res.json();
      if (data.started) {
        setJobRunning(true);
      }
      showToast(
        data.started
          ? "収集を開始しました"
          : data.reason || "収集を開始できませんでした"
      );
    } catch {
      showToast("収集を開始できませんでした");
    } finally {
      setRunning(false);
    }
  }

  async function handleRetryFailed() {
    try {
      const res = await fetch("/api/collection/retry-failed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast("やり直しに失敗しました");
        return;
      }
      showToast(`${data.reset}社を調べ直します。次の収集時に処理されます`);
      load();
    } catch {
      showToast("やり直しに失敗しました");
    }
  }

  async function patchSource(id: number, body: Record<string, unknown>, message: string) {
    try {
      const res = await fetch(`/api/collection/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        showToast("更新に失敗しました");
        return;
      }
      showToast(message);
      load();
    } catch {
      showToast("更新に失敗しました");
    }
  }

  async function handleDelete(source: CollectionSource) {
    if (!confirm(`「${source.keyword}」の収集をやめますか？\n収集済みの企業は残ります。`)) {
      return;
    }
    try {
      const res = await fetch(`/api/collection/sources/${source.id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("削除に失敗しました");
        return;
      }
      showToast("キーワードを削除しました");
      load();
    } catch {
      showToast("削除に失敗しました");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-(--color-muted)">
        <SpinnerGap size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* タブ見出し直下の1行説明。隣の「キーワードで探す」との取り違えを防ぐ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-(--color-foreground)">
            ここに登録したものは毎日自動で集め続けます（1回だけ探すときはキーワード検索へ）
          </p>
          <p className="mt-1 text-[13px] text-(--color-muted)">
            登録したキーワードで1日1回自動収集し、送れる状態まで裏で準備します。
            最終実行: {formatDateTime(status?.lastRunAt ?? null)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={load} className={BTN_SECONDARY}>
            <ArrowClockwise size={16} />
            更新
          </button>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className={BTN_PRIMARY}
          >
            {running ? <SpinnerGap size={16} className="animate-spin" /> : <Play size={16} weight="fill" />}
            今すぐ収集
          </button>
        </div>
      </div>

      {/* 上: 在庫サマリ（全商材の合計。商材スイッチャーの影響は受けない＝IA-DESIGN §3.4） */}
      {status && (
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CompactStat
              label="すぐ送れる宛先"
              value={`${status.readyCount}件`}
              hint="送信済み・送信しないリストを除いた実数"
              tone={status.isLowStock ? "warning" : "normal"}
            />
            <CompactStat
              label="残り日数の目安"
              value={`約${status.daysRemaining}日`}
              hint={
                status.isPaceEstimated
                  ? "送信実績が無いため仮に1日10件で試算"
                  : `直近7日の実績 1日あたり約${status.dailyPace.toFixed(1)}件`
              }
              tone={status.isLowStock ? "warning" : "normal"}
            />
            <CompactStat
              label="準備中"
              value={`${status.pendingEnrichment}社`}
              hint="HPを調べて連絡先を集めている途中"
            />
            <CompactStat
              label="調査できず"
              value={`${status.failedEnrichment}社`}
              hint="公式サイトが見つからない等"
              tone={status.failedEnrichment > 0 ? "warning" : "normal"}
            />
          </div>
          <p className="text-[12px] text-(--color-muted)">
            この4つは全商材の合計です。
          </p>
          <InventoryPanel status={status} onRetryFailed={handleRetryFailed} />
        </section>
      )}

      {jobRunning && (
        <div className="rounded-xl border border-(--color-primary)/30 bg-(--color-primary-light) p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <SpinnerGap size={20} className="animate-spin text-(--color-primary-text) shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">収集を実行中...</p>
              <p className="mt-0.5 text-[13px] text-(--color-muted)">
                企業の検索とHP調査を行っています。完了まで数分かかります。このまま待つか、別のページに移動しても大丈夫です。
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-(--color-primary)/15">
            <div className="h-full w-1/3 rounded-full bg-(--color-primary) animate-[progress-slide_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {/* 中: 収集元リスト（いま何を集め続けているか） */}
      <Card
        title="収集元"
        description="毎日ここに並んでいるものを順番に集めます。止めたいものは一時停止できます。"
        Icon={Stack}
        bodyClassName="p-4 sm:p-5"
      >
        {noSourceError && (
          <p className="mb-3 rounded-lg bg-(--color-danger-light) px-3 py-2 text-[13px] text-(--color-danger-text) animate-fade-in">
            収集するにはキーワードを追加してください。下のフォームからキーワードを登録すると収集できます。
          </p>
        )}

        <div className="flex flex-col gap-2">
          {sources.length === 0 && (
            <p className="py-6 text-center text-[13px] text-(--color-muted)">
              キーワードがまだありません。追加すると収集が始まります。
            </p>
          )}
          {sources.map((source) => {
            const isActive = source.is_active === 1 && !source.paused_kind;
            return (
            <div
              key={source.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border border-(--color-border) p-3 transition-opacity motion-reduce:transition-none ${
                isActive ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      isActive ? "bg-(--color-success)" : "bg-(--color-muted)"
                    }`}
                  />
                  <MethodBadge sourceType={source.source_type} />
                  <p className="min-w-0 truncate text-sm font-medium">
                    {source.source_type === "wantedly_url" ? (source.url ?? source.keyword) : source.keyword}
                  </p>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-(--color-success-light) px-2 py-0.5 text-[11px] font-medium text-(--color-success-text)">
                      収集対象
                    </span>
                  )}
                </div>
                <p className="mt-1 pl-4 text-[12px] text-(--color-muted)">
                  {source.source_type === "wantedly_direct"
                    ? sourceMethod(source.source_type).hint
                    : source.source_type === "wantedly_url"
                      ? sourceMethod(source.source_type).hint
                      : `検索元: ${source.site || "自動判定"}`}
                  {" "}・ 最終実行 {formatDateTime(source.last_run_at)}
                </p>
                {source.paused_kind && (
                  <p
                    className={`mt-1.5 rounded px-2 py-1 text-[12px] text-pretty ${
                      source.paused_kind === "blocked"
                        ? "bg-(--color-danger-light) text-(--color-danger-text)"
                        : "bg-(--color-warning-light) text-(--color-warning-text)"
                    }`}
                  >
                    {source.paused_reason}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {source.paused_kind ? (
                  <button
                    type="button"
                    onClick={() =>
                      patchSource(source.id, { action: "resume" }, "収集を再開しました")
                    }
                    className={BTN_SECONDARY}
                  >
                    再開する
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      patchSource(
                        source.id,
                        { is_active: source.is_active !== 1 },
                        source.is_active === 1 ? "収集を止めました" : "収集を再開しました"
                      )
                    }
                    className={BTN_SECONDARY}
                  >
                    {source.is_active === 1 ? "一時停止" : "有効にする"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(source)}
                  className={ICON_BTN_DANGER}
                  aria-label="削除"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </Card>

      {/* 下: 収集元の追加（3手段） */}
      <Card
        title="収集元を追加"
        description="集め方は3つあります。どれも次回の収集から対象になります。"
        Icon={ListPlus}
        bodyClassName="p-4 sm:p-5"
      >
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-(--color-foreground)">
          <MethodBadge sourceType="keyword_search" />
          キーワードで常時集める（毎回この条件を検索。URLは入れない）
        </p>
        <form onSubmit={handleAdd} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例: 長期インターン 募集 エンジニア（URLは不可）"
            aria-label="収集キーワード"
            className={`${FIELD} sm:flex-1`}
          />
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="検索元サイト（任意）"
            aria-label="検索元サイト"
            className={`${FIELD} sm:w-[170px]`}
          />
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value === "" ? "" : Number(e.target.value))}
            title="このキーワードで集める企業に付ける商材タグ（任意）"
            aria-label="商材タグ"
            className={`${FORM_SELECT} sm:w-[180px]`}
          >
            <option value="">商材タグなし</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving || !keyword.trim()}
            className={`${BTN_PRIMARY} sm:w-[110px]`}
          >
            {saving ? <SpinnerGap size={16} className="animate-spin" /> : <Plus size={16} />}
            追加
          </button>
        </form>
        <p className="mt-1.5 text-[12px] text-(--color-muted)">
          検索エンジン経由で企業を探します。検索元サイトは空欄で構いません（自動で判断します）。
        </p>

        <hr className="my-5 border-(--color-border)" />

        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-(--color-foreground)">
          <MethodBadge sourceType="wantedly_url" />
          特定ページを巡回して集める（現在 Wantedly のみ対応）
        </p>
        <form onSubmit={handleAddUrl} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={wantedlyUrl}
            onChange={(e) => setWantedlyUrl(e.target.value)}
            placeholder="WantedlyのURLを貼り付け（検索条件付きのページ可）"
            aria-label="WantedlyのURL"
            className={`${FIELD} sm:flex-1`}
          />
          <button
            type="submit"
            disabled={addingUrl || !wantedlyUrl.trim()}
            title="貼り付けたWantedlyの一覧/検索URLのページを巡回して企業を集めます"
            className={`${BTN_PRIMARY} sm:w-[180px]`}
          >
            {addingUrl ? <SpinnerGap size={16} className="animate-spin" /> : <Plus size={16} />}
            このURLから収集
          </button>
        </form>
        <p className="mt-1.5 text-[12px] text-(--color-muted)">
          Wantedlyの検索結果や一覧ページのURLを貼ると、そのページ（と続きのページ）を巡回して企業を集めます。上の商材タグも一緒に付きます。
        </p>

        {!hasWantedlySource && (
          <>
            <hr className="my-5 border-(--color-border)" />
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-(--color-foreground)">
              <MethodBadge sourceType="wantedly_direct" />
              Wantedlyの新着をまとめて集める
            </p>
            <button
              type="button"
              onClick={handleAddWantedly}
              disabled={addingWantedly}
              className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-(--color-border) text-sm text-(--color-muted) transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:text-(--color-primary-text) disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
            >
              {addingWantedly ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Wantedly新着を収集元に追加
            </button>
          </>
        )}
      </Card>

      <Card
        title="実行の記録"
        description="「結果0件」が続くと自動で止まります。取れているのに新規が増えない場合は、そのキーワードを掘り尽くしたサインです。"
        Icon={ArrowClockwise}
        bodyClassName="p-4 sm:p-5"
      >
        {runs.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-(--color-muted)">
            まだ実行されていません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-(--color-muted)">
                  <th className="py-2 pr-3 font-medium">日時</th>
                  <th className="py-2 pr-3 font-medium">結果</th>
                  <th className="py-2 pr-3 text-right font-medium">取得</th>
                  <th className="py-2 pr-3 text-right font-medium">新規</th>
                  <th className="py-2 font-medium">備考</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-(--color-border) last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {formatDateTime(run.started_at)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                          RUN_STATUS_STYLES[run.status] ?? ""
                        }`}
                      >
                        {RUN_STATUS_LABELS[run.status] ?? run.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{run.found_count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{run.new_count}</td>
                    <td className="py-2 text-(--color-muted)">
                      {run.error || (run.skipped_count > 0 ? `${run.skipped_count}件は登録済み` : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ActivityLogPanel />

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
