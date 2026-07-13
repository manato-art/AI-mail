"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookmarkSimple,
  Copy,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  X,
  Check,
  FloppyDisk,
} from "@phosphor-icons/react";
import type { Template } from "@/lib/types";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/templates");
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setTemplates(data);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function startEdit(t: Template) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditSubject(t.subject);
    setEditBody(t.body);
    setCreating(false);
  }

  function startCreate() {
    setEditingId(null);
    setEditName("");
    setEditSubject("");
    setEditBody("");
    setCreating(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  async function handleSave() {
    if (!editName.trim()) { showToast("テンプレート名を入力してください"); return; }
    setSaving(true);
    try {
      if (creating) {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName, subject: editSubject, body: editBody }),
        });
        if (!res.ok) throw new Error();
        const created: Template = await res.json();
        setTemplates((prev) => [created, ...prev]);
        showToast("テンプレートを作成しました");
      } else if (editingId !== null) {
        const res = await fetch(`/api/templates/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName, subject: editSubject, body: editBody }),
        });
        if (!res.ok) throw new Error();
        const updated: Template = await res.json();
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
        showToast("テンプレートを更新しました");
      }
      cancelEdit();
    } catch {
      showToast("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    try {
      await fetch(`/api/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) cancelEdit();
      showToast("テンプレートを削除しました");
    } catch {
      showToast("削除に失敗しました");
    }
  }

  async function handleCopy(t: Template) {
    try {
      await navigator.clipboard.writeText(`${t.subject}\n\n${t.body}`);
      showToast("コピーしました");
    } catch {
      showToast("コピーに失敗しました");
    }
  }

  const isEditing = creating || editingId !== null;

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-xl font-bold tracking-tight">テンプレート</h1>
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">テンプレート</h1>
          {templates.length > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-(--color-primary-light) px-2 text-xs font-semibold text-(--color-primary)">
              {templates.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={isEditing}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-3.5 text-xs font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} weight="bold" />
          新規作成
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_420px]">
        {/* Left: template list */}
        <div className="space-y-2">
          {templates.length === 0 && !creating && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-card) px-6 py-16 text-center">
              <BookmarkSimple size={28} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-(--color-muted)">テンプレートがありません</p>
              <p className="text-xs text-(--color-muted)">メール詳細画面の「テンプレ保存」から追加できます</p>
            </div>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-xl border bg-(--color-card) px-4 py-3 transition-colors ${editingId === t.id ? "border-(--color-primary) ring-2 ring-(--color-primary)/10" : "border-(--color-border) hover:border-(--color-primary)/40"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p className="mt-0.5 truncate text-xs text-(--color-muted)">{t.subject || "件名なし"}</p>
                <p className="mt-0.5 text-[10px] text-(--color-muted)">{formatDate(t.updated_at)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => handleCopy(t)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) hover:bg-(--color-primary-light) hover:text-(--color-primary)" title="コピー">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={() => startEdit(t)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) hover:bg-(--color-primary-light) hover:text-(--color-primary)" title="編集">
                  <PencilSimple size={14} />
                </button>
                <button type="button" onClick={() => handleDelete(t.id)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) hover:bg-(--color-danger-light) hover:text-(--color-danger)" title="削除">
                  <Trash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right: edit panel */}
        {isEditing && (
          <div className="sticky top-6 h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card) animate-fade-in">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3.5">
              <h2 className="text-sm font-semibold">{creating ? "新規テンプレート" : "テンプレート編集"}</h2>
              <button type="button" onClick={cancelEdit} className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) hover:bg-(--color-danger-light) hover:text-(--color-danger)">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">テンプレート名</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                  placeholder="テンプレート名"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">件名</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                  placeholder="メールの件名"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">本文</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-3 text-[13px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                  placeholder="メール本文"
                />
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
