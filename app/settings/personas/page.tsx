"use client";

import { useEffect, useState } from "react";
import {
  CaretDown,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  User,
  Warning,
} from "@phosphor-icons/react";
import type { Persona, PersonaInput } from "@/lib/types";

type ParamKey = "logic" | "passion" | "politeness" | "salesiness" | "length";

const EMPTY_FORM: PersonaInput = {
  name: "",
  title: "",
  gender: "",
  age_range: "20代",
  company_name: "",
  signature_block: "",
  logic: 3,
  passion: 3,
  politeness: 3,
  salesiness: 3,
  length: 3,
};

const AGE_RANGES = ["20代", "30代", "40代", "50代+"] as const;

const PARAMETER_CONFIG: {
  key: ParamKey;
  label: string;
  minLabel: string;
  maxLabel: string;
  color: string;
}[] = [
  {
    key: "logic",
    label: "論理性",
    minLabel: "感情・共感型",
    maxLabel: "ロジカル",
    color: "var(--trait-logic)",
  },
  {
    key: "passion",
    label: "熱量",
    minLabel: "低（淡々）",
    maxLabel: "高（前のめり）",
    color: "var(--trait-passion)",
  },
  {
    key: "politeness",
    label: "丁寧さ",
    minLabel: "フランク寄り",
    maxLabel: "最敬体",
    color: "var(--trait-polite)",
  },
  {
    key: "salesiness",
    label: "営業感",
    minLabel: "控えめ・相談風",
    maxLabel: "ストレート",
    color: "var(--trait-sales)",
  },
  {
    key: "length",
    label: "文章量",
    minLabel: "短め",
    maxLabel: "長め",
    color: "var(--trait-length)",
  },
];

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PersonaInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchPersonas() {
    try {
      const res = await fetch("/api/personas");
      if (!res.ok) throw new Error("人格一覧の取得に失敗しました。");
      const data: Persona[] = await res.json();
      setPersonas(data);
      setListError(null);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "人格一覧の取得に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPersonas() {
      try {
        const res = await fetch("/api/personas");
        if (!res.ok) throw new Error("人格一覧の取得に失敗しました。");
        const data: Persona[] = await res.json();
        if (!cancelled) {
          setPersonas(data);
          setListError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(
            err instanceof Error ? err.message : "人格一覧の取得に失敗しました。"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPersonas();
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

  function openEditForm(persona: Persona) {
    setEditingId(persona.id);
    setForm({
      name: persona.name,
      title: persona.title,
      gender: persona.gender,
      age_range: persona.age_range,
      company_name: persona.company_name,
      signature_block: persona.signature_block,
      logic: persona.logic,
      passion: persona.passion,
      politeness: persona.politeness,
      salesiness: persona.salesiness,
      length: persona.length,
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

  function updateParam(key: ParamKey, value: number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.title.trim()) {
      setFormError("必須項目を入力してください。");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const endpoint = editingId ? `/api/personas/${editingId}` : "/api/personas";
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
      await fetchPersonas();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(persona: Persona) {
    if (!window.confirm(`「${persona.name}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/personas/${persona.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("削除に失敗しました。");
      await fetchPersonas();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "削除に失敗しました。");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
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
        <PersonaForm
          form={form}
          editing={editingId !== null}
          saving={saving}
          error={formError}
          onChange={setForm}
          onParamChange={updateParam}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      )}

      {loading ? (
        <p className="text-sm text-(--color-muted)">読み込み中...</p>
      ) : personas.length === 0 ? (
        <EmptyState onCreate={openCreateForm} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 transition-colors hover:border-(--color-primary)"
            >
              <div className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                    >
                      {persona.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {persona.name}
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {persona.title}
                        {persona.company_name && ` / ${persona.company_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEditForm(persona)}
                      aria-label="編集"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <PencilSimple size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(persona)}
                      aria-label="削除"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {PARAMETER_CONFIG.map((param) => (
                    <div key={param.key} className="flex items-center gap-2.5">
                      <span className="w-12 shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        {param.label}
                      </span>
                      <div className="flex flex-1 items-center gap-[3px]">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className="h-[5px] flex-1 rounded-full transition-opacity"
                            style={{
                              backgroundColor: param.color,
                              opacity: n <= persona[param.key] ? 1 : 0.15,
                            }}
                          />
                        ))}
                      </div>
                      <span
                        className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums"
                        style={{ color: param.color }}
                      >
                        {persona[param.key]}
                      </span>
                    </div>
                  ))}
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
        <User size={24} className="text-gray-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        人格が登録されていません
      </p>
      <p className="mt-1 text-sm text-(--color-muted)">
        メールの送信者となる人格を登録しましょう
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

function PersonaForm({
  form,
  editing,
  saving,
  error,
  onChange,
  onParamChange,
  onSubmit,
  onCancel,
}: {
  form: PersonaInput;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onChange: (form: PersonaInput) => void;
  onParamChange: (key: ParamKey, value: number) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-in mb-6 space-y-6 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {editing ? "人格を編集" : "新規人格登録"}
      </h2>

      {error && (
        <div className="flex gap-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-3.5 text-sm text-(--color-danger)">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="border-b border-(--color-border) pb-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          基本情報
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              名前
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
              役職
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              className="h-11 w-full rounded-lg border border-(--color-border) px-3 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              性別
            </label>
            <div className="relative">
              <select
                value={form.gender}
                onChange={(e) => onChange({ ...form, gender: e.target.value })}
                className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-white dark:bg-slate-800 px-3 pr-9 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                <option value="">未設定</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
              </select>
              <CaretDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              年代
            </label>
            <div className="relative">
              <select
                value={form.age_range}
                onChange={(e) => onChange({ ...form, age_range: e.target.value })}
                className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-white dark:bg-slate-800 px-3 pr-9 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                {AGE_RANGES.map((range) => (
                  <option key={range} value={range}>
                    {range}
                  </option>
                ))}
              </select>
              <CaretDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              会社名
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) =>
                onChange({ ...form, company_name: e.target.value })
              }
              className="h-11 w-full rounded-lg border border-(--color-border) px-3 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            署名ブロック
          </label>
          <textarea
            rows={6}
            value={form.signature_block}
            onChange={(e) =>
              onChange({ ...form, signature_block: e.target.value })
            }
            className="w-full rounded-lg border border-(--color-border) px-3 py-2.5 font-mono text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>
      </div>

      <div className="space-y-5">
        <h3 className="border-b border-(--color-border) pb-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          性格パラメータ
        </h3>

        <div className="space-y-5">
          {PARAMETER_CONFIG.map((param) => (
            <div key={param.key}>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {param.label}
                </label>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-(--color-primary-light) text-xs font-semibold text-(--color-primary)">
                  {form[param.key]}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={form[param.key]}
                onChange={(e) => onParamChange(param.key, Number(e.target.value))}
                className="w-full cursor-pointer accent-(--color-primary)"
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-(--color-muted)">
                <span>{param.minLabel}</span>
                <span>{param.maxLabel}</span>
              </div>
            </div>
          ))}
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
