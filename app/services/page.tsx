"use client";

import { useEffect, useState } from "react";
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">サービス管理</h1>
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
        <p className="text-gray-500">読み込み中...</p>
      ) : services.length === 0 ? (
        <p className="text-gray-500">サービスが登録されていません。</p>
      ) : (
        <div className="space-y-4">
          {services.map((service) => (
            <div key={service.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-lg">{service.name}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {truncate(service.description, 80)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    強み: {truncate(service.strengths, 80)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(service)}
                    className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(service)}
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
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-lg shadow p-6 mb-6 space-y-4"
    >
      <h2 className="text-lg font-semibold">
        {editing ? "サービスを編集" : "新規サービス登録"}
      </h2>

      {error && (
        <div className="rounded-lg border border-[--color-danger] bg-red-50 p-3 text-sm text-[--color-danger]">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          サービス名
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
          サービス説明
        </label>
        <textarea
          required
          rows={3}
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          強み
        </label>
        <textarea
          required
          rows={3}
          value={form.strengths}
          onChange={(e) => onChange({ ...form, strengths: e.target.value })}
          className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ターゲット
        </label>
        <textarea
          required
          rows={3}
          value={form.target}
          onChange={(e) => onChange({ ...form, target: e.target.value })}
          className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          LP・HP URL
        </label>
        <input
          type="url"
          value={form.lp_url}
          onChange={(e) => onChange({ ...form, lp_url: e.target.value })}
          placeholder="https://example.co.jp"
          className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
        />
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
