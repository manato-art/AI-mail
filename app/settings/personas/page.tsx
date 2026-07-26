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
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  CountBadge,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  SELECT,
  TEXTAREA,
} from "@/components/ui-kit";

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
  /** バー（面）の色 */
  color: string;
  /** 数字（文字）の色。面と同じ濃さだと白地で 4.5:1 に届かないので専用トークンを使う */
  textColor: string;
}[] = [
  {
    key: "logic",
    label: "論理性",
    minLabel: "感情・共感型",
    maxLabel: "ロジカル",
    color: "var(--trait-logic)",
    textColor: "var(--trait-logic-text)",
  },
  {
    key: "passion",
    label: "熱量",
    minLabel: "低（淡々）",
    maxLabel: "高（前のめり）",
    color: "var(--trait-passion)",
    textColor: "var(--trait-passion-text)",
  },
  {
    key: "politeness",
    label: "丁寧さ",
    minLabel: "フランク寄り",
    maxLabel: "最敬体",
    color: "var(--trait-polite)",
    textColor: "var(--trait-polite-text)",
  },
  {
    key: "salesiness",
    label: "営業感",
    minLabel: "控えめ・相談風",
    maxLabel: "ストレート",
    color: "var(--trait-sales)",
    textColor: "var(--trait-sales-text)",
  },
  {
    key: "length",
    label: "文章量",
    minLabel: "短め",
    maxLabel: "長め",
    color: "var(--trait-length)",
    textColor: "var(--trait-length-text)",
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
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {personas.length > 0 && <CountBadge count={personas.length} />}
          <p className="text-[13px] leading-relaxed text-(--color-muted)">
            メールの差出人になる人の設定です
          </p>
        </div>
        <button type="button" onClick={openCreateForm} className={BTN_PRIMARY}>
          <Plus size={16} weight="bold" />
          新規登録
        </button>
      </div>

      {listError && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-(--color-danger)/30 bg-(--color-danger-light) p-4 text-sm text-(--color-danger-text)">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">{listError}</p>
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
              className={`${CARD} transition-colors motion-reduce:transition-none hover:border-(--color-primary)/50`}
            >
              <div className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                    >
                      {persona.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-semibold">{persona.name}</h2>
                      <p className="truncate text-[13px] text-(--color-muted)">
                        {persona.title}
                        {persona.company_name && ` / ${persona.company_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditForm(persona)}
                      aria-label="編集"
                      title="編集"
                      className={ICON_BTN}
                    >
                      <PencilSimple size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(persona)}
                      aria-label="削除"
                      title="削除"
                      className={ICON_BTN_DANGER}
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {PARAMETER_CONFIG.map((param) => (
                    <div key={param.key} className="flex items-center gap-2.5">
                      <span className="w-14 shrink-0 text-[13px] font-medium text-(--color-muted)">
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
                        className="w-4 shrink-0 text-right text-[13px] font-semibold tabular-nums"
                        style={{ color: param.textColor }}
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-(--color-border) bg-(--color-card) px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--color-primary-light)">
        <User size={26} className="text-(--color-primary-text)" />
      </div>
      <p className="text-[15px] font-semibold">人格が登録されていません</p>
      <p className="mt-1.5 text-sm leading-relaxed text-(--color-muted)">
        メールの送信者となる人格を登録しましょう
      </p>
      <button type="button" onClick={onCreate} className={`${BTN_PRIMARY} mt-5`}>
        <Plus size={16} weight="bold" />
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
    <form onSubmit={onSubmit} className={`${CARD} animate-fade-in mb-6 space-y-6 p-6`}>
      <h2 className="text-lg font-semibold text-balance">
        {editing ? "人格を編集" : "新規人格登録"}
      </h2>

      {error && (
        <div className="flex gap-2.5 rounded-xl border border-(--color-danger)/30 bg-(--color-danger-light) p-3.5 text-sm text-(--color-danger-text)">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="border-b border-(--color-border) pb-2.5 text-[15px] font-semibold">
          基本情報
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="persona-name" className={LABEL}>
              名前
            </label>
            <input
              id="persona-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="persona-title" className={LABEL}>
              役職
            </label>
            <input
              id="persona-title"
              type="text"
              required
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="persona-gender" className={LABEL}>
              性別
            </label>
            <div className="relative">
              <select
                id="persona-gender"
                value={form.gender}
                onChange={(e) => onChange({ ...form, gender: e.target.value })}
                className={SELECT}
              >
                <option value="">未設定</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
              </select>
              <CaretDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
              />
            </div>
          </div>

          <div>
            <label htmlFor="persona-age" className={LABEL}>
              年代
            </label>
            <div className="relative">
              <select
                id="persona-age"
                value={form.age_range}
                onChange={(e) => onChange({ ...form, age_range: e.target.value })}
                className={SELECT}
              >
                {AGE_RANGES.map((range) => (
                  <option key={range} value={range}>
                    {range}
                  </option>
                ))}
              </select>
              <CaretDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="persona-company" className={LABEL}>
              会社名
            </label>
            <input
              id="persona-company"
              type="text"
              value={form.company_name}
              onChange={(e) =>
                onChange({ ...form, company_name: e.target.value })
              }
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="persona-signature" className={LABEL}>
            署名ブロック
          </label>
          <textarea
            id="persona-signature"
            rows={6}
            value={form.signature_block}
            onChange={(e) =>
              onChange({ ...form, signature_block: e.target.value })
            }
            className={`${TEXTAREA} font-mono`}
          />
        </div>
      </div>

      <div className="space-y-5">
        <h3 className="border-b border-(--color-border) pb-2.5 text-[15px] font-semibold">
          性格パラメータ
        </h3>

        <div className="space-y-5">
          {PARAMETER_CONFIG.map((param) => (
            <div key={param.key}>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor={`persona-param-${param.key}`} className="text-sm font-medium">
                  {param.label}
                </label>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-(--color-primary-light) text-[13px] font-semibold text-(--color-primary-text)">
                  {form[param.key]}
                </span>
              </div>
              <input
                id={`persona-param-${param.key}`}
                type="range"
                min={1}
                max={5}
                step={1}
                value={form[param.key]}
                onChange={(e) => onParamChange(param.key, Number(e.target.value))}
                className="w-full cursor-pointer accent-(--color-primary)"
              />
              <div className="mt-1.5 flex items-center justify-between text-[13px] text-(--color-muted)">
                <span>{param.minLabel}</span>
                <span>{param.maxLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" disabled={saving} className={BTN_PRIMARY}>
          {saving && <SpinnerGap size={16} className="animate-spin" />}
          {saving ? "保存中..." : "保存"}
        </button>
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
