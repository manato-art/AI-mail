"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@phosphor-icons/react";
import type { ActivityEntry } from "@/lib/activity-log";

const LOG_POLL_MS = 2000;
const MAX_ENTRIES = 200;

const TYPE_COLORS: Record<ActivityEntry["type"], string> = {
  success: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  info: "text-gray-300",
};

export function ActivityLogPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const lastId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/collection/activity?after=${lastId.current}`);
        if (!res.ok || cancelled) return;
        const data: { entries: ActivityEntry[] } = await res.json();
        if (data.entries.length > 0) {
          setEntries((prev) => [...prev, ...data.entries].slice(-MAX_ENTRIES));
          lastId.current = data.entries[data.entries.length - 1].id;
          requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
        }
      } catch { /* retry next tick */ }
    }
    poll();
    const timer = setInterval(poll, LOG_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open]);

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-bold transition-colors hover:bg-(--color-card-hover) cursor-pointer"
      >
        <Terminal size={16} className="text-(--color-muted)" />
        活動ログ
        {entries.length > 0 && (
          <span className="ml-1 rounded-full bg-(--color-primary)/10 px-2 py-0.5 text-[11px] tabular-nums text-(--color-primary)">
            {entries.length}
          </span>
        )}
        <svg
          className={`ml-auto h-4 w-4 text-(--color-muted) transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-(--color-border) bg-gray-950 px-4 py-3 font-mono text-[12px] leading-relaxed text-gray-300 max-h-[400px] overflow-y-auto">
          {entries.length === 0 ? (
            <p className="py-4 text-center text-gray-500">
              ログはまだありません。「今すぐ収集」を実行するとここに経過が流れます。
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flex gap-2 py-0.5">
                <span className="shrink-0 text-gray-600">{entry.time}</span>
                <span className={TYPE_COLORS[entry.type]}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}
