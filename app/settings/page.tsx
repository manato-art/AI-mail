"use client";

import { useEffect, useState } from "react";
import {
  CaretDown,
  Check,
  EnvelopeSimple,
  FloppyDisk,
  GoogleLogo,
  MagnifyingGlass,
  PlugsConnected,
  ShieldCheck,
  SlidersHorizontal,
  SpinnerGap,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { Toast } from "@/components/toast";
import { AppearanceCard } from "@/components/appearance-card";
import {
  BTN_DANGER_SOLID,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Card,
  FIELD,
  HELP,
  LABEL,
  SELECT,
} from "@/components/ui-kit";

interface SenderInfo {
  id: number;
  email: string;
  display_name: string;
  auth_status: string;
  daily_limit: number;
  booking_tool: string;
  booking_url: string;
}

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Gmailの接続がキャンセルされました。もう一度お試しください。",
  invalid_state:
    "接続の検証に失敗しました。この画面の「Gmailアカウントを接続」から始め直してください（古いリンクを開いた場合もこの表示になります）。",
  no_code: "Googleから認可コードが返りませんでした。もう一度お試しください。",
  token_exchange_failed: "Gmailとの接続に失敗しました。時間をおいてもう一度お試しください。",
};

/**
 * Gmail接続の結果はURLパラメータで戻ってくる。
 * useSearchParams() を使うとページ全体がサーバ描画を放棄し、
 * JSが読めない状況で真っ白になる（ログイン画面で実際に起きた）ため使わない。
 */
function readGmailResult(): { success: boolean; error: string | null } {
  if (typeof window === "undefined") return { success: false, error: null };
  const params = new URLSearchParams(window.location.search);
  return { success: params.get("gmail_success") === "true", error: params.get("gmail_error") };
}

/** 保存ボタンの3状態（通常／保存中／保存済み）を1か所にまとめる */
function SaveButton({
  saving,
  saved,
  onClick,
  disabled,
}: {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled ?? saving} className={BTN_PRIMARY}>
      {saving ? (
        <SpinnerGap size={16} className="animate-spin" />
      ) : saved ? (
        <Check size={16} weight="bold" />
      ) : (
        <FloppyDisk size={16} />
      )}
      {saved ? "保存済み" : "保存"}
    </button>
  );
}

export default function SettingsPage() {
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
  const [serperKeyConfigured, setSerperKeyConfigured] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [searchSaved, setSearchSaved] = useState(false);

  const [gmailSenders, setGmailSenders] = useState<SenderInfo[]>([]);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [limitDrafts, setLimitDrafts] = useState<Record<number, string>>({});
  const [bookingDrafts, setBookingDrafts] = useState<Record<number, string>>({});

  const [authEnabled, setAuthEnabled] = useState(true);
  const [authPasswordWeak, setAuthPasswordWeak] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  const [gmailResult, setGmailResult] = useState<{ success: boolean; error: string | null }>({
    success: false,
    error: null,
  });
  const gmailSuccess = gmailResult.success;
  const gmailError = gmailResult.error;

  useEffect(() => {
    // location はブラウザ専用。遅延初期化にするとサーバ描画と食い違って
    // ハイドレーションエラーになるため、マウント後に一度だけ読む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGmailResult(readGmailResult());
  }, []);

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
          // APIキーはサーバから返らない（漏洩防止）。設定済みかどうかだけ受け取る
          setSerperApiKey("");
          setSerperKeyConfigured(settings.serper_api_key_configured === "true");
          setAuthEnabled(settings.auth_enabled === "true");
          setAuthPasswordWeak(settings.auth_password_weak === "true");
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

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      showToast("ログアウトに失敗しました");
    }
  }

  async function handleClearHistory() {
    if (!confirm("生成履歴をすべて削除しますか？この操作は取り消せません。")) return;
    try {
      const res = await fetch("/api/prospects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL_PROSPECTS" }),
      });
      if (!res.ok) {
        showToast("削除に失敗しました");
        return;
      }
      window.location.reload();
    } catch {
      showToast("削除に失敗しました");
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">

      {/* アクセス保護の状態。未設定だと本番URLを知っている誰でも操作できてしまう */}
      {!authEnabled && (
        <div className="flex gap-2.5 rounded-xl border border-(--color-danger)/30 bg-(--color-danger-light) px-4 py-3.5 text-sm">
          <Warning className="mt-0.5 shrink-0 text-(--color-danger)" size={18} weight="fill" />
          <div className="leading-relaxed">
            <strong className="text-(--color-danger)">このアプリは誰でもアクセスできる状態です。</strong>
            <br />
            Railway の環境変数に <code className="rounded bg-(--color-card) px-1.5 py-0.5 text-[13px]">APP_PASSWORD</code> を設定すると、
            ログイン画面で保護されます（12文字以上を推奨）。
          </div>
        </div>
      )}
      {authEnabled && authPasswordWeak && (
        <div className="flex gap-2.5 rounded-xl border border-(--color-warning)/30 bg-(--color-warning-light) px-4 py-3.5 text-sm">
          <Warning className="mt-0.5 shrink-0 text-(--color-warning)" size={18} weight="fill" />
          <div className="leading-relaxed">
            設定されているパスワードが短すぎます。12文字以上に変更してください。
          </div>
        </div>
      )}

      {/* Gmail connection feedback */}
      {gmailSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-(--color-success)/30 bg-(--color-success-light) px-4 py-3.5 text-sm font-medium text-(--color-success)">
          <Check size={16} weight="bold" className="shrink-0" />
          Gmail アカウントの接続に成功しました
        </div>
      )}
      {gmailError && (
        <div className="flex items-start gap-2 rounded-xl border border-(--color-danger)/30 bg-(--color-danger-light) px-4 py-3.5 text-sm font-medium text-(--color-danger)">
          <Warning className="mt-0.5 shrink-0" size={16} weight="bold" />
          <span className="leading-relaxed">
            {GMAIL_ERROR_MESSAGES[gmailError] ?? `Gmail接続に失敗しました（${gmailError}）`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {/* 左列 */}
        <div className="space-y-5">
          {/* ① Gmail接続 */}
          <Card
            title="Gmail接続"
            description="メール送信に使用するGmailアカウント"
            Icon={GoogleLogo}
            bodyClassName="space-y-3 p-5"
          >
            {gmailSenders.length > 0 ? (
              <div className="space-y-3">
                {gmailSenders.map((sender) => {
                  const connected = sender.auth_status === "connected";
                  return (
                    <div key={sender.id} className="rounded-lg border border-(--color-border) p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                              connected
                                ? "bg-(--color-success-light) text-(--color-success)"
                                : "bg-(--color-danger-light) text-(--color-danger)"
                            }`}
                          >
                            <GoogleLogo size={17} weight="bold" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{sender.email}</p>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                                  connected
                                    ? "bg-(--color-success-light) text-(--color-success)"
                                    : "bg-(--color-danger-light) text-(--color-danger)"
                                }`}
                              >
                                {connected ? <Check size={11} weight="bold" /> : <Warning size={11} weight="fill" />}
                                {connected ? "接続中" : "要再認証"}
                              </span>
                              {sender.daily_limit === 0 && (
                                <span className="text-[13px] text-(--color-muted)">上限なし</span>
                              )}
                            </span>
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
                            className={`${FIELD} w-24 text-right tabular-nums`}
                          />
                          <span className="whitespace-nowrap text-[13px] text-(--color-muted)">通/日</span>
                          <button
                            type="button"
                            onClick={() => handleDisconnectSender(sender.id)}
                            title="接続を解除"
                            aria-label="接続を解除"
                            className="ml-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-danger-light) hover:text-(--color-danger) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-(--color-border) pt-4">
                        <label
                          htmlFor={`booking-url-${sender.id}`}
                          className="mb-1.5 block text-[13px] font-medium text-(--color-muted)"
                        >
                          日程調整URL（2通目以降で使用・任意）
                        </label>
                        <input
                          id={`booking-url-${sender.id}`}
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
                          className={FIELD}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-(--color-border) px-4 py-6 text-center text-sm text-(--color-muted)">
                接続済みアカウントはありません
              </p>
            )}
            <button
              type="button"
              onClick={handleConnectGmail}
              disabled={connectingGmail}
              className={`${BTN_SECONDARY} w-full`}
            >
              {connectingGmail ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <PlugsConnected size={16} />
              )}
              {connectingGmail ? "接続中..." : "Gmailアカウントを接続"}
            </button>
          </Card>

          {/* ② 配信停止受付アドレス */}
          <Card
            title="配信停止受付アドレス"
            description="List-Unsubscribeヘッダに使用するアドレス"
            Icon={EnvelopeSimple}
          >
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[220px] flex-1">
                <div className="relative">
                  <EnvelopeSimple
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
                  />
                  <input
                    id="unsubscribe-email"
                    type="email"
                    value={senderDraft}
                    onChange={(e) => setSenderDraft(e.target.value)}
                    aria-label="配信停止受付アドレス"
                    className={`${FIELD} pl-9`}
                    placeholder="unsubscribe@example.com"
                  />
                </div>
              </div>
              <SaveButton
                saving={savingSender}
                saved={senderSaved}
                onClick={handleSaveSender}
                disabled={savingSender || senderDraft.trim() === senderEmail}
              />
            </div>
          </Card>

          {/* ③ キーワード検索 */}
          <Card
            title="キーワード検索"
            description="企業リスト自動作成の検索方法"
            Icon={MagnifyingGlass}
            bodyClassName="space-y-4 p-5"
          >
            <div>
              <span className={LABEL}>検索モード</span>
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    { value: "api", title: "API", note: "高速・安定" },
                    { value: "scrape", title: "スクレイピング", note: "無料・APIキー不要" },
                  ] as const
                ).map((opt) => {
                  const active = searchMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSearchMode(opt.value)}
                      aria-pressed={active}
                      className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 py-3 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
                        active
                          ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-foreground)"
                          : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary)/40 hover:text-(--color-foreground)"
                      }`}
                    >
                      <span className="text-sm font-semibold">{opt.title}</span>
                      <span className="text-[12px] font-normal">{opt.note}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {searchMode === "api" && (
              <div>
                <label htmlFor="serper-key" className={LABEL}>
                  Serper APIキー
                </label>
                <input
                  id="serper-key"
                  type="password"
                  value={serperApiKey}
                  onChange={(e) => setSerperApiKey(e.target.value)}
                  className={FIELD}
                  placeholder={serperKeyConfigured ? "設定済み（変更する場合のみ入力）" : "serper.dev のAPIキー"}
                  autoComplete="off"
                />
                <p className={HELP}>
                  {serperKeyConfigured
                    ? "登録済みのキーは画面に表示されません。変更したい場合のみ新しいキーを入力してください"
                    : "serper.dev で登録すると2,500クエリ無料"}
                </p>
              </div>
            )}
            {searchMode === "scrape" && (
              <p className="rounded-lg bg-(--color-primary-light) px-3.5 py-3 text-[13px] leading-relaxed">
                DuckDuckGoの検索結果をスクレイピングします。APIキーは不要ですが、大量利用時にブロックされる場合があります。
              </p>
            )}
            <div className="flex justify-end">
              <SaveButton saving={savingSearch} saved={searchSaved} onClick={handleSaveSearch} />
            </div>
          </Card>
        </div>

        {/* 右列 */}
        <div className="space-y-5">
          {/* ④ デフォルト設定 */}
          <Card
            title="デフォルト設定"
            description="生成時に初期選択されるサービスと人格"
            Icon={SlidersHorizontal}
            bodyClassName="space-y-4 p-5"
          >
            <div>
              <label htmlFor="default-service" className={LABEL}>
                サービス
              </label>
              <div className="relative">
                <select
                  id="default-service"
                  value={defaultServiceId}
                  onChange={(e) => setDefaultServiceId(e.target.value)}
                  className={SELECT}
                >
                  <option value="">未設定</option>
                  {services.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
                <CaretDown
                  size={15}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
                />
              </div>
            </div>
            <div>
              <label htmlFor="default-persona" className={LABEL}>
                人格
              </label>
              <div className="relative">
                <select
                  id="default-persona"
                  value={defaultPersonaId}
                  onChange={(e) => setDefaultPersonaId(e.target.value)}
                  className={SELECT}
                >
                  <option value="">未設定</option>
                  {personas.map((p) => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                </select>
                <CaretDown
                  size={15}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <SaveButton saving={savingDefaults} saved={defaultsSaved} onClick={handleSaveDefaults} />
            </div>
          </Card>

          {/* ⑤ 外観 */}
          <AppearanceCard />

          {/* ⑥ アクセス */}
          <Card
            title="アクセス"
            description={authEnabled ? "パスワードで保護されています" : "パスワードが設定されていません"}
            Icon={ShieldCheck}
            bodyClassName="space-y-3 p-5"
          >
            <div
              className={`flex items-center gap-2 rounded-lg px-3.5 py-3 text-sm font-medium ${
                authEnabled
                  ? "bg-(--color-success-light) text-(--color-success)"
                  : "bg-(--color-danger-light) text-(--color-danger)"
              }`}
            >
              {authEnabled ? (
                <ShieldCheck size={17} weight="fill" className="shrink-0" />
              ) : (
                <Warning size={17} weight="fill" className="shrink-0" />
              )}
              {authEnabled ? "保護あり" : "保護なし"}
            </div>
            {authEnabled && (
              <button type="button" onClick={handleLogout} className={`${BTN_SECONDARY} w-full`}>
                ログアウト
              </button>
            )}
          </Card>
        </div>
      </div>

      {/* ⑦ 危険ゾーン（取り消せない操作だけをここに隔離する） */}
      <Card
        title="データ管理"
        description="ここから先は取り消せません。実行する前にもう一度確認してください。"
        Icon={Warning}
        tone="danger"
        bodyClassName="flex flex-wrap items-center justify-between gap-3 p-5"
      >
        <p className="min-w-[220px] flex-1 text-sm leading-relaxed text-(--color-muted)">
          これまでに生成したメールの履歴をすべて消します。元に戻すことはできません。
        </p>
        <button type="button" onClick={handleClearHistory} className={BTN_DANGER_SOLID}>
          <Trash size={16} />
          生成履歴をすべて削除
        </button>
      </Card>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
