"use client";

import { useEffect, useState } from "react";
import {
  EnvelopeSimple,
  FloppyDisk,
  Key,
  Moon,
  Sun,
  Monitor,
  SpinnerGap,
  Check,
  Trash,
} from "@phosphor-icons/react";
import { useTheme, ACCENT_COLORS } from "@/lib/theme-context";

type Theme = "light" | "dark" | "system";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "ライト", Icon: Sun },
  { value: "dark", label: "ダーク", Icon: Moon },
  { value: "system", label: "システム", Icon: Monitor },
];

export default function SettingsPage() {
  const { theme, setTheme, accent, setAccent } = useTheme();

  const [senderEmail, setSenderEmail] = useState("");
  const [senderDraft, setSenderDraft] = useState("");
  const [savingSender, setSavingSender] = useState(false);
  const [senderSaved, setSenderSaved] = useState(false);

  const [defaultServiceId, setDefaultServiceId] = useState("");
  const [defaultPersonaId, setDefaultPersonaId] = useState("");
  const [services, setServices] = useState<{ id: number; name: string }[]>([]);
  const [personas, setPersonas] = useState<{ id: number; name: string }[]>([]);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  const [eightApiKey, setEightApiKey] = useState("");
  const [eightApiKeyDraft, setEightApiKeyDraft] = useState("");
  const [savingEight, setSavingEight] = useState(false);
  const [eightSaved, setEightSaved] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, svcRes, perRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/services"),
          fetch("/api/personas"),
        ]);
        const settings = settingsRes.ok ? await settingsRes.json() : {};
        const svcData = svcRes.ok ? await svcRes.json() : [];
        const perData = perRes.ok ? await perRes.json() : [];
        if (!cancelled) {
          setSenderEmail(settings.sender_email || "");
          setSenderDraft(settings.sender_email || "");
          setDefaultServiceId(settings.default_service_id || "");
          setDefaultPersonaId(settings.default_persona_id || "");
          setEightApiKey(settings.eight_api_key || "");
          setEightApiKeyDraft(settings.eight_api_key || "");
          setServices(svcData);
          setPersonas(perData);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSaveSender() {
    setSavingSender(true);
    setSenderSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_email: senderDraft.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSenderEmail(data.sender_email);
        setSenderDraft(data.sender_email);
        setSenderSaved(true);
        setTimeout(() => setSenderSaved(false), 2000);
      }
    } catch { /* ignore */ }
    finally { setSavingSender(false); }
  }

  async function handleSaveDefaults() {
    setSavingDefaults(true);
    setDefaultsSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_service_id: defaultServiceId,
          default_persona_id: defaultPersonaId,
        }),
      });
      setDefaultsSaved(true);
      setTimeout(() => setDefaultsSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSavingDefaults(false); }
  }

  async function handleSaveEight() {
    setSavingEight(true);
    setEightSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eight_api_key: eightApiKeyDraft.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setEightApiKey(data.eight_api_key);
        setEightApiKeyDraft(data.eight_api_key);
        setEightSaved(true);
        setTimeout(() => setEightSaved(false), 2000);
      }
    } catch { /* ignore */ }
    finally { setSavingEight(false); }
  }

  async function handleClearHistory() {
    if (!confirm("生成履歴をすべて削除しますか？この操作は取り消せません。")) return;
    try {
      await fetch("/api/prospects", { method: "DELETE" });
      window.location.reload();
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-xl font-bold tracking-tight">設定</h1>
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-xl font-bold tracking-tight">設定</h1>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-5">
          {/* Appearance: theme + accent combined */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">外観</h2>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-medium text-(--color-muted)">テーマ</label>
                <div className="grid grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((opt) => {
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTheme(opt.value)}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-xs font-medium transition-all ${
                          active
                            ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)"
                            : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary)/40 hover:text-(--color-foreground)"
                        }`}
                      >
                        <opt.Icon size={20} weight={active ? "fill" : "regular"} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-(--color-muted)">アクセントカラー</label>
                <div className="flex flex-wrap gap-2.5">
                  {ACCENT_COLORS.map((color) => {
                    const active = accent === color.key;
                    return (
                      <button
                        key={color.key}
                        type="button"
                        onClick={() => setAccent(color.key)}
                        className="group flex cursor-pointer flex-col items-center gap-1"
                        title={color.label}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                            active ? "ring-2 ring-offset-2 ring-offset-(--color-card)" : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: color.primary, ...(active ? { boxShadow: `0 0 0 2px ${color.primary}` } : {}) }}
                        >
                          {active && <Check size={14} weight="bold" className="text-white" />}
                        </span>
                        <span className={`text-[10px] font-medium ${active ? "text-(--color-foreground)" : "text-(--color-muted)"}`}>
                          {color.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Danger zone */}
          <section className="rounded-xl border border-(--color-danger)/30 bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-danger)/20 px-5 py-4">
              <h2 className="text-sm font-semibold text-(--color-danger)">データ管理</h2>
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={handleClearHistory}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-(--color-danger)/30 text-sm font-medium text-(--color-danger) transition-colors hover:bg-(--color-danger-light)"
              >
                <Trash size={14} />
                生成履歴をすべて削除
              </button>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Sender Email */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">送信元メールアドレス</h2>
              <p className="mt-0.5 text-xs text-(--color-muted)">Gmail作成画面で使用するアカウント</p>
            </div>
            <div className="p-5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted) pointer-events-none" />
                  <input
                    type="email"
                    value={senderDraft}
                    onChange={(e) => setSenderDraft(e.target.value)}
                    className="h-10 w-full rounded-lg border border-(--color-border) pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                    placeholder="example@gmail.com"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveSender}
                  disabled={savingSender || senderDraft.trim() === senderEmail}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingSender ? (
                    <SpinnerGap size={14} className="animate-spin" />
                  ) : senderSaved ? (
                    <Check size={14} weight="bold" />
                  ) : (
                    <FloppyDisk size={14} />
                  )}
                  {senderSaved ? "保存済み" : "保存"}
                </button>
              </div>
            </div>
          </section>

          {/* Default selections */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">デフォルト設定</h2>
              <p className="mt-0.5 text-xs text-(--color-muted)">生成時に初期選択されるサービスと人格</p>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-muted)">サービス</label>
                <select
                  value={defaultServiceId}
                  onChange={(e) => setDefaultServiceId(e.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  <option value="">未設定</option>
                  {services.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-muted)">人格</label>
                <select
                  value={defaultPersonaId}
                  onChange={(e) => setDefaultPersonaId(e.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  <option value="">未設定</option>
                  {personas.map((p) => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleSaveDefaults}
                disabled={savingDefaults}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingDefaults ? (
                  <SpinnerGap size={14} className="animate-spin" />
                ) : defaultsSaved ? (
                  <Check size={14} weight="bold" />
                ) : (
                  <FloppyDisk size={14} />
                )}
                {defaultsSaved ? "保存済み" : "保存"}
              </button>
            </div>
          </section>

          {/* Eight API Key */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">Eight（名刺管理）連携</h2>
              <p className="mt-0.5 text-xs text-(--color-muted)">一括送信で名刺データを取り込むためのAPIキー</p>
            </div>
            <div className="p-5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted) pointer-events-none" />
                  <input
                    type="password"
                    value={eightApiKeyDraft}
                    onChange={(e) => setEightApiKeyDraft(e.target.value)}
                    className="h-10 w-full rounded-lg border border-(--color-border) pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                    placeholder="Eight APIキー"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveEight}
                  disabled={savingEight || eightApiKeyDraft.trim() === eightApiKey}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingEight ? (
                    <SpinnerGap size={14} className="animate-spin" />
                  ) : eightSaved ? (
                    <Check size={14} weight="bold" />
                  ) : (
                    <FloppyDisk size={14} />
                  )}
                  {eightSaved ? "保存済み" : "保存"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
