"use client";

import { useEffect, useState } from "react";
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
}[] = [
  {
    key: "logic",
    label: "論理性",
    minLabel: "感情・共感型",
    maxLabel: "ロジカル",
  },
  {
    key: "passion",
    label: "熱量",
    minLabel: "低（淡々）",
    maxLabel: "高（前のめり）",
  },
  {
    key: "politeness",
    label: "丁寧さ",
    minLabel: "フランク寄り",
    maxLabel: "最敬体",
  },
  {
    key: "salesiness",
    label: "営業感",
    minLabel: "控えめ・相談風",
    maxLabel: "ストレート",
  },
  {
    key: "length",
    label: "文章量",
    minLabel: "短め",
    maxLabel: "長め",
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">人格管理（メール作成者）</h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="bg-[--color-primary] hover:bg-[--color-primary-hover] text-white rounded-lg px-4 py-2 font-medium"
        >
          新規登録
        </button>
      </div>

      {listError && (
        <div className="mb-4 rounded-lg border border-[--color-danger] bg-red-50 p-4 text-sm text-[--color-danger]">
          {listError}
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
        <p className="text-gray-500">読み込み中...</p>
      ) : personas.length === 0 ? (
        <p className="text-gray-500">人格が登録されていません。</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {personas.map((persona) => (
            <div key={persona.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-lg">{persona.name}</h2>
                  <p className="text-sm text-gray-600">
                    {persona.title}
                    {persona.company_name && ` / ${persona.company_name}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PARAMETER_CONFIG.map((param) => (
                      <span
                        key={param.key}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                      >
                        {param.label} {persona[param.key]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(persona)}
                    className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(persona)}
                    className="bg-[--color-danger] hover:bg-[--color-danger-hover] text-white rounded-lg px-4 py-2 text-sm"
                  >
                    削除
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
      className="bg-white rounded-lg shadow p-6 mb-6 space-y-6"
    >
      <h2 className="text-lg font-semibold">
        {editing ? "人格を編集" : "新規人格登録"}
      </h2>

      {error && (
        <div className="rounded-lg border border-[--color-danger] bg-red-50 p-3 text-sm text-[--color-danger]">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-[--color-border] pb-2">
          基本情報
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              名前
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              役職
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              性別
            </label>
            <select
              value={form.gender}
              onChange={(e) => onChange({ ...form, gender: e.target.value })}
              className="w-full h-10 px-3 border border-[--color-border] rounded-lg focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            >
              <option value="">未設定</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              年代
            </label>
            <select
              value={form.age_range}
              onChange={(e) => onChange({ ...form, age_range: e.target.value })}
              className="w-full h-10 px-3 border border-[--color-border] rounded-lg focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            >
              {AGE_RANGES.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              会社名
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) =>
                onChange({ ...form, company_name: e.target.value })
              }
              className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            署名ブロック
          </label>
          <textarea
            rows={6}
            value={form.signature_block}
            onChange={(e) =>
              onChange({ ...form, signature_block: e.target.value })
            }
            className="w-full border border-[--color-border] rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-[--color-border] pb-2">
          性格パラメータ
        </h3>

        <div className="space-y-5">
          {PARAMETER_CONFIG.map((param) => (
            <div key={param.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">
                  {param.label}
                </label>
                <span className="text-sm font-semibold text-[--color-primary]">
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
                className="w-full accent-[--color-primary]"
              />
              <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                <span>{param.minLabel}</span>
                <span>{param.maxLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-[--color-primary] hover:bg-[--color-primary-hover] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
