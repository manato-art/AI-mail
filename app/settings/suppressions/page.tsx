"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MagnifyingGlass,
  Plus,
  Prohibit,
  SpinnerGap,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import type { Suppression, SuppressionReason, SuppressionTargetType } from "@/lib/types";
import { Toast } from "@/components/toast";

const REASON_LABELS: Record<SuppressionReason, string> = {
  optout: "配信停止の依頼",
  bounce: "宛先不明で戻ってきた",
  refusal_detected: "HPに営業お断りの記載",
  rejected_reply: "返信で断られた",
  manual: "手動で登録",
};

const REASON_STYLES: Record<SuppressionReason, string> = {
  optout: "bg-(--color-danger-light) text-(--color-danger)",
  bounce: "bg-(--color-warning-light) text-(--color-warning)",
  refusal_detected: "bg-(--color-danger-light) text-(--color-danger)",
  rejected_reply: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300",
  manual: "bg-(--color-primary-light) text-(--color-primary)",
};

/** 手動登録で選べる理由。自動でしか付かないものは出さない */
const SELECTABLE_REASONS: SuppressionReason[] = ["optout", "rejected_reply", "manual"];

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

export default function SuppressionsPage() {
  const [items, setItems] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [target, setTarget] = useState("");
  const [targetType, setTargetType] = useState<SuppressionTargetType>("email");
  const [reason, setReason] = useState<SuppressionReason>("optout");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/suppressions");
        const data: Suppression[] = res.ok ? await res.json() : [];
        if (!cancelled) setItems(data);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) => s.target.toLowerCase().includes(q) || s.note.toLowerCase().includes(q)
    );
  }, [items, search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !target.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, target_type: targetType, reason, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "登録に失敗しました");
        return;
      }
      setItems((prev) => [data as Suppression, ...prev.filter((s) => s.id !== data.id)]);
      setTarget("");
      setNote("");
      showToast(`${data.target} を送信しないリストに追加しました`);
    } catch {
      showToast("登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Suppression) {
    if (
      !confirm(
        `「${item.target}」を送信しないリストから外しますか？\n外すと、この宛先に再び送信できるようになります。`
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/suppressions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) {
        showToast("削除に失敗しました");
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== item.id));
      showToast("リストから外しました");
    } catch {
      showToast("削除に失敗しました");
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20">
      <div className="mb-1">
        <p className="text-[13px] text-(--color-muted)">
          ここに登録した宛先には、どの経路からも送信できなくなります
        </p>
      </div>

      <div className="mt-4 flex gap-2.5 rounded-xl border border-(--color-border) bg-(--color-card) p-4 text-[13px]">
        <Warning className="mt-0.5 shrink-0" size={18} weight="fill" style={{ color: "var(--color-warning)" }} />
        <p className="leading-relaxed text-gray-700 dark:text-gray-300">
          配信停止の依頼を受けたら、<strong>必ずここに登録してください</strong>。
          特定電子メール法では、停止の申し出があった相手への送信が禁止されています。
          宛先不明で戻ってきたものやHPに「営業お断り」の記載があったものは自動で登録されます。
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        {/* 追加フォーム */}
        <form
          onSubmit={handleAdd}
          className="h-fit rounded-xl border border-(--color-border) bg-(--color-card) p-5"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Plus size={15} weight="bold" />
            宛先を追加
          </h2>

          <div className="mt-3.5 space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                対象
              </label>
              <div className="mb-2 inline-flex rounded-lg border border-(--color-border) bg-gray-100 p-0.5 dark:bg-slate-800">
                {(["email", "domain"] as SuppressionTargetType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTargetType(t)}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      targetType === t
                        ? "bg-(--color-card) text-(--color-foreground) shadow-sm"
                        : "text-(--color-muted) hover:text-(--color-foreground)"
                    }`}
                  >
                    {t === "email" ? "メールアドレス" : "ドメイン全体"}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={targetType === "email" ? "info@example.com" : "example.com"}
                className="h-10 w-full rounded-lg border border-(--color-border) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              />
              {targetType === "domain" && (
                <p className="mt-1 text-[11px] text-(--color-muted)">
                  そのドメインの全アドレスが対象になります
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                理由
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as SuppressionReason)}
                className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                {SELECTABLE_REASONS.map((r) => (
                  <option key={r} value={r}>{REASON_LABELS[r]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                メモ（任意）
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例: 2026-07-19 に電話で停止依頼"
                className="h-10 w-full rounded-lg border border-(--color-border) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !target.trim()}
            className="mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <SpinnerGap size={15} className="animate-spin" /> : <Prohibit size={15} weight="bold" />}
            {saving ? "登録中..." : "リストに追加"}
          </button>
        </form>

        {/* 一覧 */}
        <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border) px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              登録済み
              <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-(--color-primary-light) px-1.5 text-[11px] font-bold text-(--color-primary)">
                {items.length}
              </span>
            </h2>
            <div className="relative">
              <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="アドレス・メモで検索"
                className="h-9 w-[220px] rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <p className="text-sm text-(--color-muted)">
                {items.length === 0
                  ? "まだ登録されていません"
                  : "該当する宛先が見つかりません"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-(--color-border) bg-gray-50 text-left dark:bg-slate-700/50">
                    <th className="min-w-[220px] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">対象</th>
                    <th className="min-w-[140px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">理由</th>
                    <th className="min-w-[160px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">メモ</th>
                    <th className="min-w-[140px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">登録日時</th>
                    <th className="w-[44px] px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-(--color-border) last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{s.target}</span>
                        {s.target_type === "domain" && (
                          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-(--color-muted) dark:bg-slate-700">
                            ドメイン全体
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${REASON_STYLES[s.reason] ?? ""}`}>
                          {REASON_LABELS[s.reason] ?? s.reason}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-(--color-muted)">{s.note || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-(--color-muted)">{formatDate(s.created_at)}</td>
                      <td className="px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          title="リストから外す"
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                        >
                          <Trash size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
