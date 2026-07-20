"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  Play,
  Plus,
  SpinnerGap,
  Trash,
} from "@phosphor-icons/react";
import type { CollectionRun, CollectionSource } from "@/lib/types";
import { Toast } from "@/components/toast";
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
  success: "bg-(--color-success-light) text-(--color-success)",
  no_new: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300",
  no_result: "bg-(--color-danger-light) text-(--color-danger)",
  error: "bg-(--color-danger-light) text-(--color-danger)",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
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
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [jobRunning, setJobRunning] = useState(false);

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  const load = useCallback(async () => {
    try {
      const [statusRes, sourcesRes] = await Promise.all([
        fetch("/api/collection/status"),
        fetch("/api/collection/sources"),
      ]);
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

    setSaving(true);
    try {
      const res = await fetch("/api/collection/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, site }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "登録に失敗しました");
        return;
      }
      setKeyword("");
      setSite("");
      showToast("キーワードを追加しました。次回の収集から対象になります");
      load();
    } catch {
      showToast("登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (running) return;
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-(--color-muted)">
            登録したキーワードで1日1回自動収集し、送れる状態まで裏で準備します。
            最終実行: {formatDateTime(status?.lastRunAt ?? null)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="flex h-10 items-center gap-2 rounded-lg border border-(--color-border) px-3 text-sm font-medium transition-colors hover:bg-(--color-card-hover) cursor-pointer"
          >
            <ArrowClockwise size={16} />
            更新
          </button>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className="flex h-10 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {running ? <SpinnerGap size={16} className="animate-spin" /> : <Play size={16} />}
            今すぐ収集
          </button>
        </div>
      </header>

      {jobRunning && (
        <div className="rounded-xl border border-(--color-primary)/30 bg-(--color-primary-light) p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <SpinnerGap size={20} className="animate-spin text-(--color-primary) shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">収集を実行中...</p>
              <p className="mt-0.5 text-[12px] text-(--color-muted)">
                企業の検索とHP調査を行っています。完了まで数分かかります。このまま待つか、別のページに移動しても大丈夫です。
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-(--color-primary)/15">
            <div className="h-full w-1/3 rounded-full bg-(--color-primary) animate-[progress-slide_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {status && <InventoryPanel status={status} onRetryFailed={handleRetryFailed} />}

      <section className="rounded-xl border border-(--color-border) bg-(--color-card) p-5">
        <h2 className="text-sm font-bold">収集キーワード</h2>
        <p className="mt-1 text-[12px] text-(--color-muted)">
          検索エンジン経由で企業を探します。検索元サイトは空欄で構いません（自動で判断します）。
        </p>

        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例: 長期インターン 募集 エンジニア"
            className="h-10 flex-1 rounded-lg border border-(--color-border) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="検索元サイト（任意）"
            className="h-10 rounded-lg border border-(--color-border) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) sm:w-[200px]"
          />
          <button
            type="submit"
            disabled={saving || !keyword.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {saving ? <SpinnerGap size={16} className="animate-spin" /> : <Plus size={16} />}
            追加
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          {sources.length === 0 && (
            <p className="py-6 text-center text-[13px] text-(--color-muted)">
              キーワードがまだありません。追加すると収集が始まります。
            </p>
          )}
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-border) p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{source.keyword}</p>
                <p className="mt-0.5 text-[11px] text-(--color-muted)">
                  {source.site || "検索元サイト未定"} ・ 最終実行{" "}
                  {formatDateTime(source.last_run_at)}
                </p>
                {source.paused_kind && (
                  <p
                    className={`mt-1.5 rounded px-2 py-1 text-[11px] ${
                      source.paused_kind === "blocked"
                        ? "bg-(--color-danger-light) text-(--color-danger)"
                        : "bg-(--color-warning-light) text-(--color-warning)"
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
                    className="h-9 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium transition-colors hover:bg-(--color-card-hover) cursor-pointer"
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
                    className="h-9 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium transition-colors hover:bg-(--color-card-hover) cursor-pointer"
                  >
                    {source.is_active === 1 ? "一時停止" : "有効にする"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(source)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger) cursor-pointer"
                  aria-label="削除"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-(--color-border) bg-(--color-card) p-5">
        <h2 className="text-sm font-bold">実行の記録</h2>
        <p className="mt-1 text-[12px] text-(--color-muted)">
          「結果0件」が続くと自動で止まります。取れているのに新規が増えない場合は、
          そのキーワードを掘り尽くしたサインです。
        </p>

        {runs.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-(--color-muted)">
            まだ実行されていません。
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
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
      </section>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
