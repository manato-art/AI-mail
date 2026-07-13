"use client";

import { useEffect, useState } from "react";
import {
  Briefcase,
  FileText,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import type { Service, ServiceInput } from "@/lib/types";

const EMPTY_FORM: ServiceInput = {
  name: "",
  description: "",
  strengths: "",
  target: "",
  lp_url: "",
};

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ServiceInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchServices() {
    try {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("サービス一覧の取得に失敗しました。");
      const data: Service[] = await res.json();
      setServices(data);
      setListError(null);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "サービス一覧の取得に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      try {
        const res = await fetch("/api/services");
        if (!res.ok) throw new Error("サービス一覧の取得に失敗しました。");
        const data: Service[] = await res.json();
        if (!cancelled) {
          setServices(data);
          setListError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(
            err instanceof Error ? err.message : "サービス一覧の取得に失敗しました。"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadServices();
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(service: Service) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description,
      strengths: service.strengths,
      target: service.target,
      lp_url: service.lp_url ?? "",
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.name.trim() ||
      !form.description.trim() ||
      !form.strengths.trim() ||
      !form.target.trim()
    ) {
      setFormError("必須項目を入力してください。");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const endpoint = editingId ? `/api/services/${editingId}` : "/api/services";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "保存に失敗しました。");
      }
      closeForm();
      await fetchServices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(service: Service) {
    if (!window.confirm(`「${service.name}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/services/${service.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("削除に失敗しました。");
      await fetchServices();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "削除に失敗しました。");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">サービス管理</h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
        >
          <Plus size={16} />
          新規登録
        </button>
      </div>

      {listError && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-4 text-sm text-(--color-danger)">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p>{listError}</p>
        </div>
      )}

      {showForm && (
        <ServiceForm
          form={form}
          editing={editingId !== null}
          saving={saving}
          error={formError}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      )}

      {loading ? (
        <p className="text-sm text-(--color-muted)">読み込み中...</p>
      ) : services.length === 0 ? (
        <EmptyState onCreate={openCreateForm} />
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.id}
              className="rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-5 transition-colors hover:bg-(--color-card-hover)"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">{service.name}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {truncate(service.description, 80)}
                  </p>
                  <div className="mt-2.5">
                    <span className="inline-flex max-w-full items-center rounded-full bg-(--color-primary-light) px-2.5 py-1 text-xs font-medium text-(--color-primary)">
                      {truncate(service.strengths, 80)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEditForm(service)}
                    aria-label="編集"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <PencilSimple size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(service)}
                    aria-label="削除"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-(--color-border) bg-white dark:bg-slate-800 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700">
        <Briefcase size={24} className="text-gray-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        サービスが登録されていません
      </p>
      <p className="mt-1 text-sm text-(--color-muted)">
        最初のサービスを登録して、営業メール作成を始めましょう
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
      >
        <Plus size={16} />
        新規登録
      </button>
    </div>
  );
}

function ServiceForm({
  form,
  editing,
  saving,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: ServiceInput;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onChange: (form: ServiceInput) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const [specText, setSpecText] = useState("");
  const [specOpen, setSpecOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleParse() {
    if (!specText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/services/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: specText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解析に失敗しました。");
      }
      onChange({
        name: data.name || form.name,
        description: data.description || form.description,
        strengths: data.strengths || form.strengths,
        target: data.target || form.target,
        lp_url: data.lp_url || form.lp_url,
      });
      setSpecOpen(false);
      setSpecText("");
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "解析に失敗しました。"
      );
    } finally {
      setParsing(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-in mb-6 space-y-5 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {editing ? "サービスを編集" : "新規サービス登録"}
        </h2>
        {!specOpen && (
          <button
            type="button"
            onClick={() => setSpecOpen(true)}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors hover:bg-(--color-card-hover) hover:text-(--color-primary)"
          >
            <FileText size={14} />
            仕様書から入力
          </button>
        )}
      </div>

      {specOpen && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              仕様書・企画書を貼り付け
            </p>
            <button
              type="button"
              onClick={() => { setSpecOpen(false); setSpecText(""); setParseError(null); }}
              className="text-xs text-(--color-muted) hover:text-(--color-foreground) cursor-pointer"
            >
              閉じる
            </button>
          </div>
          <textarea
            rows={8}
            value={specText}
            onChange={(e) => setSpecText(e.target.value)}
            disabled={parsing}
            placeholder="サービスの仕様書や企画書のテキストをここに貼り付けてください..."
            className="w-full rounded-lg border border-(--color-border) bg-white dark:bg-slate-800 px-3 py-2.5 text-sm leading-relaxed transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
          />
          {parseError && (
            <p className="text-sm text-(--color-danger)">{parseError}</p>
          )}
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || !specText.trim()}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {parsing ? (
              <>
                <SpinnerGap size={14} className="animate-spin" />
                解析中...
              </>
            ) : (
              <>
                <FileText size={14} />
                解析してフォームに反映
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="flex gap-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-3.5 text-sm text-(--color-danger)">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            サービス名
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            className="h-11 w-full rounded-lg border border-(--color-border) px-3 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            サービス説明
          </label>
          <textarea
            required
            rows={3}
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-(--color-border) px-3 py-2.5 leading-relaxed transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            強み
          </label>
          <textarea
            required
            rows={3}
            value={form.strengths}
            onChange={(e) => onChange({ ...form, strengths: e.target.value })}
            className="w-full rounded-lg border border-(--color-border) px-3 py-2.5 leading-relaxed transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            ターゲット
          </label>
          <textarea
            required
            rows={3}
            value={form.target}
            onChange={(e) => onChange({ ...form, target: e.target.value })}
            className="w-full rounded-lg border border-(--color-border) px-3 py-2.5 leading-relaxed transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            LP・HP URL
          </label>
          <input
            type="url"
            value={form.lp_url}
            onChange={(e) => onChange({ ...form, lp_url: e.target.value })}
            placeholder="https://example.co.jp"
            className="h-11 w-full rounded-lg border border-(--color-border) px-3 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <SpinnerGap size={16} className="animate-spin" />}
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-11 cursor-pointer rounded-lg border border-(--color-border) px-5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
