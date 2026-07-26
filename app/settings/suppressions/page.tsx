"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CaretDown,
  MagnifyingGlass,
  Plus,
  Prohibit,
  SpinnerGap,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import type { Suppression, SuppressionReason, SuppressionTargetType } from "@/lib/types";
import { Toast } from "@/components/toast";
import {
  BTN_PRIMARY,
  Card,
  CountBadge,
  FIELD,
  ICON_BTN_DANGER,
  LABEL,
  SELECT,
} from "@/components/ui-kit";

const REASON_LABELS: Record<SuppressionReason, string> = {
  optout: "配信停止の依頼",
  bounce: "宛先不明で戻ってきた",
  refusal_detected: "HPに営業お断りの記載",
  rejected_reply: "返信で断られた",
  manual: "手動で登録",
};

const REASON_STYLES: Record<SuppressionReason, string> = {
  optout: "bg-(--color-danger-light) text-(--color-danger-text)",
  bounce: "bg-(--color-warning-light) text-(--color-warning-text)",
  refusal_detected: "bg-(--color-danger-light) text-(--color-danger-text)",
  rejected_reply: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300",
  manual: "bg-(--color-primary-light) text-(--color-primary-text)",
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
          <SpinnerGap size={24} className="animate-spin text-(--color-primary-text)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20">
      {/* 法令の注意は必ず画面のいちばん上に置く */}
      <div className="flex gap-2.5 rounded-xl border border-(--color-warning)/40 bg-(--color-warning-light) p-4 text-sm">
        <Warning className="mt-0.5 shrink-0 text-(--color-warning-text)" size={20} weight="fill" />
        <div className="space-y-1.5 leading-relaxed">
          <p className="font-semibold">
            ここに登録した宛先には、どの経路からも送信できなくなります
          </p>
          <p className="text-[13px] leading-relaxed">
            配信停止の依頼を受けたら、<strong>必ずここに登録してください</strong>。
            特定電子メール法では、停止の申し出があった相手への送信が禁止されています。
            宛先不明で戻ってきたものやHPに「営業お断り」の記載があったものは自動で登録されます。
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_1fr]">
        {/* 追加フォーム */}
        <form onSubmit={handleAdd} className="h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="border-b border-(--color-border) px-5 py-4">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-(--color-primary-light) text-(--color-primary-text)">
                <Plus size={15} weight="bold" />
              </span>
              宛先を追加
            </h2>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <span className={LABEL}>対象</span>
              <div className="mb-2 inline-flex rounded-lg border border-(--color-border) bg-(--color-background) p-1">
                {(["email", "domain"] as SuppressionTargetType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTargetType(t)}
                    aria-pressed={targetType === t}
                    className={`min-h-10 cursor-pointer rounded-md px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
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
                aria-label="対象"
                className={FIELD}
              />
              {targetType === "domain" && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-(--color-muted)">
                  そのドメインの全アドレスが対象になります
                </p>
              )}
            </div>

            <div>
              <label htmlFor="suppression-reason" className={LABEL}>
                理由
              </label>
              <div className="relative">
                <select
                  id="suppression-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as SuppressionReason)}
                  className={SELECT}
                >
                  {SELECTABLE_REASONS.map((r) => (
                    <option key={r} value={r}>{REASON_LABELS[r]}</option>
                  ))}
                </select>
                <CaretDown
                  size={15}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
                />
              </div>
            </div>

            <div>
              <label htmlFor="suppression-note" className={LABEL}>
                メモ（任意）
              </label>
              <input
                id="suppression-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例: 2026-07-19 に電話で停止依頼"
                className={FIELD}
              />
            </div>

            <button type="submit" disabled={saving || !target.trim()} className={`${BTN_PRIMARY} w-full`}>
              {saving ? <SpinnerGap size={16} className="animate-spin" /> : <Prohibit size={16} weight="bold" />}
              {saving ? "登録中..." : "リストに追加"}
            </button>
          </div>
        </form>

        {/* 一覧 */}
        <Card
          title={
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <span>登録済み</span>
              <CountBadge count={items.length} />
            </span>
          }
          action={
            <div className="relative min-w-0">
              <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="アドレス・メモで検索"
                aria-label="アドレス・メモで検索"
                className={`${FIELD} w-[220px] max-w-full pl-9`}
              />
            </div>
          }
          bodyClassName=""
        >
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
              <table className="w-full min-w-0 text-sm">
                <thead>
                  <tr className="border-b border-(--color-border) bg-(--color-background) text-left">
                    <th className="min-w-[220px] px-4 py-3 text-[12px] font-semibold tracking-wide text-(--color-muted)">対象</th>
                    <th className="min-w-[140px] px-3 py-3 text-[12px] font-semibold tracking-wide text-(--color-muted)">理由</th>
                    <th className="min-w-[160px] px-3 py-3 text-[12px] font-semibold tracking-wide text-(--color-muted)">メモ</th>
                    <th className="min-w-[150px] px-3 py-3 text-[12px] font-semibold tracking-wide text-(--color-muted)">登録日時</th>
                    <th className="w-[60px] px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-(--color-border) last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{s.target}</span>
                        {s.target_type === "domain" && (
                          <span className="ml-1.5 whitespace-nowrap rounded bg-(--color-background) px-1.5 py-0.5 text-[12px] text-(--color-muted)">
                            ドメイン全体
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium ${REASON_STYLES[s.reason] ?? ""}`}>
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
                          aria-label="リストから外す"
                          className={ICON_BTN_DANGER}
                        >
                          <Trash size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
