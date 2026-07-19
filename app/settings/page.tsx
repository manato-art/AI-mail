"use client";

import { Suspense, useEffect, useState } from "react";
import {
  EnvelopeSimple,
  FloppyDisk,
  GoogleLogo,
  Moon,
  Sun,
  Monitor,
  SpinnerGap,
  Check,
  Trash,
  PlugsConnected,
  Warning,
} from "@phosphor-icons/react";
import { useTheme, ACCENT_COLORS } from "@/lib/theme-context";
import { useSearchParams } from "next/navigation";
import { Toast } from "@/components/toast";

type Theme = "light" | "dark" | "system";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "ライト", Icon: Sun },
  { value: "dark", label: "ダーク", Icon: Moon },
  { value: "system", label: "システム", Icon: Monitor },
];

interface SenderInfo {
  id: number;
  email: string;
  display_name: string;
  auth_status: string;
  daily_limit: number;
  booking_tool: string;
  booking_url: string;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { theme, setTheme, accent, setAccent } = useTheme();
  const searchParams = useSearchParams();

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

  const [searchMode, setSearchMode] = useState<"api" | "scrape">("api");
  const [serperApiKey, setSerperApiKey] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const [searchSaved, setSearchSaved] = useState(false);

  const [gmailSenders, setGmailSenders] = useState<SenderInfo[]>([]);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [limitDrafts, setLimitDrafts] = useState<Record<number, string>>({});
  const [bookingDrafts, setBookingDrafts] = useState<Record<number, string>>({});

  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function showToast(msg: string) {
    setToast(null);
    requestAnimationFrame(() => setToast(msg));
  }

  const gmailSuccess = searchParams.get("gmail_success") === "true";
  const gmailError = searchParams.get("gmail_error");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, svcRes, perRes, sendersRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/services"),
          fetch("/api/personas"),
          fetch("/api/senders"),
        ]);
        const settings = settingsRes.ok ? await settingsRes.json() : {};
        const svcData = svcRes.ok ? await svcRes.json() : [];
        const perData = perRes.ok ? await perRes.json() : [];
        const sendersData: SenderInfo[] = sendersRes.ok ? await sendersRes.json() : [];
        if (!cancelled) {
          setSenderEmail(settings.sender_email || "");
          setSenderDraft(settings.sender_email || "");
          setDefaultServiceId(settings.default_service_id || "");
          setDefaultPersonaId(settings.default_persona_id || "");
          setSearchMode(settings.search_mode === "scrape" ? "scrape" : "api");
          setSerperApiKey(settings.serper_api_key || "");
          setServices(svcData);
          setPersonas(perData);
          setGmailSenders(sendersData);
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

  async function handleSaveSearch() {
    setSavingSearch(true);
    setSearchSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search_mode: searchMode,
          serper_api_key: serperApiKey.trim(),
        }),
      });
      setSearchSaved(true);
      setTimeout(() => setSearchSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSavingSearch(false); }
  }

  async function handleConnectGmail() {
    setConnectingGmail(true);
    try {
      const res = await fetch("/api/auth/gmail");
      if (!res.ok) throw new Error("Failed to get auth URL");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setConnectingGmail(false);
    }
  }

  async function handleSaveDailyLimit(id: number) {
    const raw = limitDrafts[id];
    if (raw === undefined) return;
    const current = gmailSenders.find((s) => s.id === id);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      showToast("上限は0以上の整数で入力してください");
      return;
    }
    if (current && current.daily_limit === value) return;
    try {
      const res = await fetch("/api/senders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, daily_limit: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "上限の保存に失敗しました");
        return;
      }
      setGmailSenders((prev) => prev.map((s) => (s.id === id ? { ...s, daily_limit: value } : s)));
      setLimitDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(value === 0 ? "日次上限を無制限にしました" : `日次上限を${value}通/日に設定しました`);
    } catch {
      showToast("上限の保存に失敗しました");
    }
  }

  async function handleSaveBookingUrl(id: number) {
    const raw = bookingDrafts[id];
    if (raw === undefined) return;
    const url = raw.trim();
    const current = gmailSenders.find((s) => s.id === id);
    if (current && current.booking_url === url) return;
    if (url && !/^https:\/\//i.test(url)) {
      showToast("日程調整URLは https:// で始まる必要があります");
      return;
    }
    try {
      const res = await fetch("/api/senders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, booking_url: url, booking_tool: current?.booking_tool ?? "calendly" }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "日程調整URLの保存に失敗しました");
        return;
      }
      setGmailSenders((prev) => prev.map((s) => (s.id === id ? { ...s, booking_url: url } : s)));
      setBookingDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(url ? "日程調整URLを保存しました" : "日程調整URLを削除しました");
    } catch {
      showToast("日程調整URLの保存に失敗しました");
    }
  }

  async function handleDisconnectSender(id: number) {
    if (!confirm("このアカウントの接続を解除しますか？")) return;
    try {
      await fetch("/api/senders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setGmailSenders((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
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

      {/* Gmail connection feedback */}
      {gmailSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-(--color-success-light) px-4 py-3 text-sm font-medium text-(--color-success)">
          <Check size={16} weight="bold" />
          Gmail アカウントの接続に成功しました
        </div>
      )}
      {gmailError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-(--color-danger-light) px-4 py-3 text-sm font-medium text-(--color-danger)">
          <Warning size={16} weight="bold" />
          Gmail接続に失敗しました（{gmailError}）
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-5">
          {/* Gmail Connection */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">Gmail接続</h2>
              <p className="mt-0.5 text-xs text-(--color-muted)">メール送信に使用するGmailアカウント</p>
            </div>
            <div className="p-5 space-y-3">
              {gmailSenders.length > 0 ? (
                <div className="space-y-2">
                  {gmailSenders.map((sender) => (
                    <div
                      key={sender.id}
                      className="rounded-lg border border-(--color-border) px-4 py-3"
                    >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          sender.auth_status === "connected"
                            ? "bg-(--color-success-light) text-(--color-success)"
                            : "bg-(--color-danger-light) text-(--color-danger)"
                        }`}>
                          <GoogleLogo size={16} weight="bold" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{sender.email}</p>
                          <p className="text-[11px] text-(--color-muted)">
                            {sender.auth_status === "connected" ? "接続中" : "要再認証"}
                            {sender.daily_limit === 0 && " · 上限なし"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={limitDrafts[sender.id] ?? String(sender.daily_limit)}
                          onChange={(e) =>
                            setLimitDrafts((prev) => ({ ...prev, [sender.id]: e.target.value }))
                          }
                          onBlur={() => handleSaveDailyLimit(sender.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          title="日次送信上限（0 = 無制限）"
                          className="h-8 w-20 rounded-md border border-(--color-border) bg-(--color-card) px-2 text-right text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                        />
                        <span className="text-[11px] text-(--color-muted)">通/日</span>
                        <button
                          type="button"
                          onClick={() => handleDisconnectSender(sender.id)}
                          className="ml-1 cursor-pointer rounded-md p-2 text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-(--color-border) pt-3">
                      <label className="mb-1 block text-[11px] font-medium text-(--color-muted)">
                        日程調整URL（2通目以降で使用・任意）
                      </label>
                      <input
                        type="url"
                        value={bookingDrafts[sender.id] ?? sender.booking_url}
                        onChange={(e) =>
                          setBookingDrafts((prev) => ({ ...prev, [sender.id]: e.target.value }))
                        }
                        onBlur={() => handleSaveBookingUrl(sender.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        placeholder="https://calendly.com/..."
                        className="h-9 w-full rounded-md border border-(--color-border) bg-(--color-card) px-3 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                      />
                    </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-(--color-muted)">接続済みアカウントはありません</p>
              )}
              <button
                type="button"
                onClick={handleConnectGmail}
                disabled={connectingGmail}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-(--color-border) text-sm font-medium text-(--color-foreground) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:opacity-50"
              >
                {connectingGmail ? (
                  <SpinnerGap size={16} className="animate-spin" />
                ) : (
                  <PlugsConnected size={16} />
                )}
                {connectingGmail ? "接続中..." : "Gmailアカウントを接続"}
              </button>
            </div>
          </section>

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
          {/* Sender Email (for List-Unsubscribe) */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">配信停止受付アドレス</h2>
              <p className="mt-0.5 text-xs text-(--color-muted)">List-Unsubscribeヘッダに使用するアドレス</p>
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
                    placeholder="unsubscribe@example.com"
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

          {/* Keyword Search */}
          <section className="rounded-xl border border-(--color-border) bg-(--color-card) overflow-hidden">
            <div className="border-b border-(--color-border) px-5 py-4">
              <h2 className="text-sm font-semibold">キーワード検索</h2>
              <p className="mt-0.5 text-xs text-(--color-muted)">企業リスト自動作成の検索方法</p>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-2 block text-xs font-medium text-(--color-muted)">検索モード</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchMode("api")}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-xs font-medium transition-all ${
                      searchMode === "api"
                        ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)"
                        : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary)/40"
                    }`}
                  >
                    <span className="text-sm">API</span>
                    <span className="text-[10px] font-normal">高速・安定</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("scrape")}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-xs font-medium transition-all ${
                      searchMode === "scrape"
                        ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)"
                        : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary)/40"
                    }`}
                  >
                    <span className="text-sm">スクレイピング</span>
                    <span className="text-[10px] font-normal">無料・APIキー不要</span>
                  </button>
                </div>
              </div>
              {searchMode === "api" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--color-muted)">Serper APIキー</label>
                  <input
                    type="password"
                    value={serperApiKey}
                    onChange={(e) => setSerperApiKey(e.target.value)}
                    className="h-10 w-full rounded-lg border border-(--color-border) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                    placeholder="serper.dev のAPIキー"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-[11px] text-(--color-muted)">serper.dev で登録すると2,500クエリ無料</p>
                </div>
              )}
              {searchMode === "scrape" && (
                <p className="rounded-lg bg-(--color-primary-light) px-3 py-2.5 text-xs text-(--color-muted)">
                  DuckDuckGoの検索結果をスクレイピングします。APIキーは不要ですが、大量利用時にブロックされる場合があります。
                </p>
              )}
              <button
                type="button"
                onClick={handleSaveSearch}
                disabled={savingSearch}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingSearch ? (
                  <SpinnerGap size={14} className="animate-spin" />
                ) : searchSaved ? (
                  <Check size={14} weight="bold" />
                ) : (
                  <FloppyDisk size={14} />
                )}
                {searchSaved ? "保存済み" : "保存"}
              </button>
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
        </div>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
