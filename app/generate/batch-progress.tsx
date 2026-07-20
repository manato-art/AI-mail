"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleNotch,
  Clock,
  SkipForward,
  Warning,
  XCircle,
  Stop,
} from "@phosphor-icons/react";

export interface BatchItem {
  url: string;
  status: "waiting" | "processing" | "done" | "skipped" | "error";
  prospectId?: number;
  companyName?: string;
  error?: string;
  skipReason?: string;
}

interface Props {
  items: BatchItem[];
  running: boolean;
  onStop: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}秒`;
}

export function BatchProgress({ items, running, onStop }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const done = items.filter((i) => i.status === "done").length;
  const skipped = items.filter((i) => i.status === "skipped").length;
  const errored = items.filter((i) => i.status === "error").length;
  const finished = done + skipped + errored;
  const pct = items.length > 0 ? Math.round((finished / items.length) * 100) : 0;

  return (
    <div className="mt-5 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {running && <CircleNotch size={16} className="animate-spin text-(--color-primary)" />}
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {running ? `生成中... (${finished}/${items.length}) ${formatElapsed(elapsed)}` : `完了 — ${done}件生成 (${formatElapsed(elapsed)})`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-(--color-muted)">{pct}%</span>
          {running && (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-red-300 dark:border-red-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors cursor-pointer"
            >
              <Stop size={12} weight="bold" />
              中止
            </button>
          )}
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-(--color-primary) transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!running && (done > 0 || skipped > 0 || errored > 0) && (
        <div className="flex gap-4 mb-4 text-xs">
          {done > 0 && (
            <span className="flex items-center gap-1 text-(--color-success)">
              <Check size={12} weight="bold" />
              {done}件 生成
            </span>
          )}
          {skipped > 0 && (
            <span className="flex items-center gap-1 text-(--color-muted)">
              <SkipForward size={12} weight="bold" />
              {skipped}件 スキップ
            </span>
          )}
          {errored > 0 && (
            <span className="flex items-center gap-1 text-(--color-danger)">
              <XCircle size={12} weight="bold" />
              {errored}件 エラー
            </span>
          )}
        </div>
      )}

      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              item.status === "processing"
                ? "bg-(--color-primary-light)"
                : item.status === "done"
                  ? "bg-(--color-success-light)"
                  : item.status === "error"
                    ? "bg-(--color-danger-light)"
                    : ""
            }`}
          >
            <StatusIcon status={item.status} />
            <span className="truncate min-w-0 flex-1">
              {item.companyName ? (
                <>
                  <span className="font-medium">{item.companyName}</span>
                  <span className="text-(--color-muted) ml-1.5">({new URL(item.url).hostname})</span>
                </>
              ) : (
                <span className={item.status === "waiting" ? "text-(--color-muted)" : ""}>
                  {tryHostname(item.url)}
                </span>
              )}
            </span>
            {item.status === "done" && item.prospectId && (
              <Link
                href={`/prospect/${item.prospectId}`}
                className="shrink-0 text-[11px] font-medium text-(--color-primary) hover:underline"
              >
                確認
              </Link>
            )}
            {item.status === "skipped" && (
              <span className="shrink-0 text-[11px] text-(--color-muted)">
                {item.skipReason ?? "スキップ"}
                {item.prospectId && (
                  <Link href={`/prospect/${item.prospectId}`} className="ml-1 text-(--color-primary) hover:underline">
                    過去の結果
                  </Link>
                )}
              </span>
            )}
            {item.status === "error" && (
              <span className="shrink-0 text-[11px] text-(--color-danger) max-w-[300px] break-words text-right">
                {item.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: BatchItem["status"] }) {
  switch (status) {
    case "waiting":
      return <Clock size={16} className="shrink-0 text-gray-300 dark:text-gray-600" />;
    case "processing":
      return <CircleNotch size={16} className="shrink-0 animate-spin text-(--color-primary)" />;
    case "done":
      return <Check size={16} weight="bold" className="shrink-0 text-(--color-success)" />;
    case "skipped":
      return <SkipForward size={16} className="shrink-0 text-(--color-muted)" />;
    case "error":
      return <Warning size={16} weight="fill" className="shrink-0 text-(--color-danger)" />;
  }
}

function tryHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
