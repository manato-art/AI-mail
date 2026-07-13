"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Briefcase,
  FileText,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  UploadSimple,
  Warning,
  X,
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.map((service) => (
            <div
              key={service.id}
              className="rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 transition-colors hover:border-(--color-primary)"
            >
              <div className="p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}
                    >
                      {service.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {service.name}
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {truncate(service.description, 40)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEditForm(service)}
                      aria-label="編集"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <PencilSimple size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(service)}
                      aria-label="削除"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>

                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 mb-3">
                  {truncate(service.description, 80)}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {service.strengths.split(/[、,\-]/).filter(Boolean).slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-md bg-(--color-border)/30 dark:bg-slate-700/50 px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300"
                    >
                      {s.trim().slice(0, 20)}
                    </span>
                  ))}
                  {service.target && (
                    <span className="inline-flex items-center rounded-md bg-(--color-success-light) px-2 py-1 text-[11px] font-medium text-(--color-success)">
                      {truncate(service.target, 20)}
                    </span>
                  )}
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

const ACCEPTED_EXTENSIONS = [".pdf", ".md", ".txt", ".markdown"];
const ACCEPTED_MIME = ["application/pdf", "text/plain", "text/markdown", "text/x-markdown"];

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
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyResult(data: { name: string; description: string; strengths: string; target: string; lp_url: string }) {
    onChange({
      name: data.name || form.name,
      description: data.description || form.description,
      strengths: data.strengths || form.strengths,
      target: data.target || form.target,
      lp_url: data.lp_url || form.lp_url,
    });
    setSpecText("");
    setSelectedFile(null);
  }

  function isValidFile(file: File): boolean {
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    return ACCEPTED_MIME.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
  }

  function handleFileSelect(file: File) {
    if (!isValidFile(file)) {
      setParseError("PDF・Markdown・テキストファイルのみ対応しています。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError("ファイルサイズは5MB以下にしてください。");
      return;
    }
    setParseError(null);
    setSelectedFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_MIME.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
      setParseError("PDF・Markdown・テキストファイルのみ対応しています。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError("ファイルサイズは5MB以下にしてください。");
      return;
    }
    setParseError(null);
    setSelectedFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  async function handleParse() {
    setParsing(true);
    setParseError(null);

    try {
      let res: Response;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch("/api/services/parse-file", {
          method: "POST",
          body: formData,
        });
      } else if (specText.trim()) {
        res = await fetch("/api/services/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: specText.trim() }),
        });
      } else {
        setParseError("テキストを入力するか、ファイルを選択してください。");
        setParsing(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解析に失敗しました。");
      }
      applyResult(data);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "解析に失敗しました。"
      );
    } finally {
      setParsing(false);
    }
  }

  const hasInput = Boolean(specText.trim()) || Boolean(selectedFile);

  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-in mb-6 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">
        {editing ? "サービスを編集" : "新規サービス登録"}
      </h2>

      {error && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-3.5 text-sm text-(--color-danger)">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              rows={2}
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
              rows={2}
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
              rows={2}
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
        </div>

        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3 self-start">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            仕様書・企画書から自動入力
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer ${
              dragging
                ? "border-(--color-primary) bg-(--color-primary-light)"
                : "border-gray-300 dark:border-gray-600 hover:border-(--color-primary) hover:bg-white dark:hover:bg-slate-800"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md,.txt,.markdown"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = "";
              }}
            />
            {selectedFile ? (
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-(--color-primary)" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedFile.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 cursor-pointer"
                >
                  <X size={12} className="text-(--color-muted)" />
                </button>
              </div>
            ) : (
              <>
                <UploadSimple size={24} className="text-(--color-muted)" />
                <p className="text-sm text-(--color-muted)">
                  ドラッグ&ドロップ、またはクリック
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  PDF・Markdown・テキスト（5MB以下）
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
            <span className="text-xs text-gray-400 dark:text-gray-500">または</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
          </div>

          <textarea
            rows={5}
            value={specText}
            onChange={(e) => { setSpecText(e.target.value); if (e.target.value.trim()) setSelectedFile(null); }}
            disabled={parsing}
            placeholder="サービス内容を直接入力..."
            className="w-full rounded-lg border border-(--color-border) bg-white dark:bg-slate-800 px-3 py-2.5 text-sm leading-relaxed transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
          />

          {parseError && (
            <p className="text-sm text-(--color-danger)">{parseError}</p>
          )}
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || !hasInput}
            className="w-full flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    </form>
  );
}
