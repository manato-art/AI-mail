"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  Check,
  Copy,
  EnvelopeSimple,
  Globe,
  Notebook,
  PaperPlaneTilt,
  SpinnerGap,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AnalysisResult, Prospect, SendStatus } from "@/lib/types";
import { Toast } from "@/components/toast";

const COMPATIBILITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const COMPATIBILITY_BG: Record<string, string> = {
  high: "bg-(--color-success-light) text-(--color-success)",
  medium: "bg-(--color-warning-light) text-(--color-warning)",
  low: "bg-(--color-danger-light) text-(--color-danger)",
};

const STATUS_LABELS: Record<SendStatus, string> = {
  unsent: "未送信",
  sent: "送信済",
  replied: "返信あり",
  meeting: "商談中",
  rejected: "見送り",
};

const STATUS_STYLES: Record<SendStatus, string> = {
  unsent: "border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400",
  sent: "border-(--color-primary) text-(--color-primary)",
  replied: "border-(--color-success) text-(--color-success)",
  meeting: "border-(--color-warning) text-(--color-warning)",
  rejected: "border-(--color-danger) text-(--color-danger)",
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function countBodyLength(body: string): number {
  const separatorIndex = body.indexOf("━━━");
  const mainText = separatorIndex === -1 ? body : body.slice(0, separatorIndex);
  return mainText.trim().length;
}

interface SenderInfo {
  id: number;
  email: string;
  display_name: string;
  auth_status: string;
  booking_url?: string;
}

export default function ProspectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [followingUp, setFollowingUp] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const [senders, setSenders] = useState<SenderInfo[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  // F14: 仕様書どおり既定OFF（1通目にカレンダーリンクを入れると返信率が下がる）
  const [includeBookingLink, setIncludeBookingLink] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [hasRefusal, setHasRefusal] = useState(false);
  const [refusalText, setRefusalText] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(null);
    setTimeout(() => setToast(message), 0);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [res, sendersRes, configRes] = await Promise.all([
          fetch(`/api/prospects/${id}`),
          fetch("/api/senders"),
          fetch("/api/settings"),
        ]);
        if (!res.ok) throw new Error("データの取得に失敗しました。");
        const data: Prospect = await res.json();
        const sendersList: SenderInfo[] = sendersRes.ok ? await sendersRes.json() : [];
        const config = configRes.ok ? await configRes.json() : {};
        if (!cancelled) {
          setProspect(data);
          setSubject(data.subject);
          setBody(data.body);
          setSenders(sendersList);
          if (sendersList.length > 0) {
            setSelectedSenderId(sendersList[0].id);
          }
          setIsTestMode(config.test_mode === "true");
          setHasRefusal(data.has_refusal === 1 || false);
          setRefusalText(data.refusal_text || null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "データの取得に失敗しました。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  const analysis = useMemo<AnalysisResult | null>(
    () => (prospect ? parseJson<AnalysisResult | null>(prospect.analysis_json, null) : null),
    [prospect]
  );

  const emailsFound = useMemo<string[]>(
    () => (prospect ? parseJson<string[]>(prospect.emails_found_json, []) : []),
    [prospect]
  );

  const bodyCharCount = useMemo(() => countBodyLength(body), [body]);

  async function handleRegenerate() {
    if (!id) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/prospects/${id}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error("再生成に失敗しました。");
      const data: Prospect = await res.json();
      setProspect(data);
      setSubject(data.subject);
      setBody(data.body);
      showToast("再生成しました");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "再生成に失敗しました。");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/prospects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) throw new Error("保存に失敗しました。");
      showToast("保存しました");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: SendStatus) {
    if (!id) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/prospects/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("ステータスの更新に失敗しました。");
      const data: Prospect = await res.json();
      setProspect(data);
      showToast(`ステータスを「${STATUS_LABELS[status]}」に変更しました`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "ステータスの更新に失敗しました。");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleFollowUp() {
    if (!id) return;
    setFollowingUp(true);
    try {
      const res = await fetch(`/api/prospects/${id}/followup`, { method: "POST" });
      if (!res.ok) throw new Error("フォローアップの生成に失敗しました。");
      const data: { subject: string; body: string } = await res.json();
      setSubject(data.subject);
      setBody(data.body);
      showToast("フォローアップメールを生成しました");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "フォローアップの生成に失敗しました。");
    } finally {
      setFollowingUp(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      showToast("コピーしました");
    } catch {
      showToast("コピーに失敗しました");
    }
  }

  async function handleSaveTemplate() {
    const name = prompt("テンプレート名を入力してください", prospect?.company_name || "テンプレート");
    if (!name) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, body }),
      });
      if (!res.ok) throw new Error("保存に失敗しました。");
      showToast("テンプレートとして保存しました");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "テンプレート保存に失敗しました。");
    }
  }

  async function handleSend() {
    if (!id || !selectedSenderId || emailsFound.length === 0) return;

    if (hasRefusal && !confirm("この企業は「営業お断り」を表明しています。送信すると特定電子メール法に違反する可能性があります。本当に送信しますか？")) {
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      await handleSave();

      async function postSend(acknowledgedWarnings: boolean) {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospectId: Number(id),
            senderId: selectedSenderId,
            toEmail: emailsFound[0],
            acknowledgedWarnings,
            includeBookingLink,
          }),
        });
        return { res, data: await res.json() };
      }

      let { res, data } = await postSend(false);

      // F18の警告は人が確認したうえで押し切れる（ブロック指摘はここを通らない）
      if (res.status === 409 && Array.isArray(data.warnings)) {
        const proceed = confirm(
          `送信前に確認したい点があります:\n\n・${data.warnings.join("\n・")}\n\nこのまま送信しますか？`
        );
        if (!proceed) {
          setSendError("送信を中止しました（要確認の指摘あり）");
          return;
        }
        ({ res, data } = await postSend(true));
      }

      if (!res.ok) {
        const errorMsg = data.reasons
          ? data.reasons.join("\n")
          : data.error || "送信に失敗しました";
        setSendError(errorMsg);
        return;
      }

      setProspect((prev) => prev ? { ...prev, send_status: "sent" } : prev);
      showToast(data.testMode ? "テスト送信しました（テストアドレス宛）" : "送信しました");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  function handleOpenForm() {
    if (!prospect?.form_url) return;
    window.open(prospect.form_url, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">メール確認</h1>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-(--color-border) bg-(--color-card) py-20 text-center">
          <SpinnerGap size={20} className="animate-spin text-(--color-primary)" />
          <p className="text-sm text-(--color-muted)">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (loadError || !prospect) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">メール確認</h1>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-(--color-danger) bg-(--color-danger-light) px-6 py-16 text-center">
          <WarningCircle size={24} weight="fill" className="text-(--color-danger)" />
          <p className="text-sm font-medium text-(--color-danger)">
            {loadError ?? "データが見つかりませんでした。"}
          </p>
        </div>
      </div>
    );
  }

  const compatStyle = COMPATIBILITY_BG[prospect.compatibility_score] ?? "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400";
  const currentStatus = (prospect.send_status || "unsent") as SendStatus;
  const canSend = senders.length > 0 && emailsFound.length > 0 && currentStatus === "unsent";
  const selectedSender = senders.find((s) => s.id === selectedSenderId);

  return (
    <div className="animate-fade-in pb-20">
      {/* Test Mode Banner */}
      {isTestMode && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">
          <Warning size={16} weight="bold" />
          テストモード: 送信先はテストアドレスに強制上書きされます
        </div>
      )}

      {/* Refusal Warning */}
      {hasRefusal && (
        <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-600 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                営業お断りの表記が検出されました
              </p>
              {refusalText && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  「{refusalText}」
                </p>
              )}
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                送信すると特定電子メール法に違反する可能性があります。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <h1 className="text-lg md:text-xl font-bold tracking-tight">
          {prospect.company_name || prospect.domain} 宛のメール
        </h1>
        <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-(--color-primary-light) px-3 py-1 text-xs font-semibold text-(--color-primary)">
          <Globe size={12} />
          {prospect.domain}
        </span>

        {/* Status selector */}
        <div className="relative ml-auto w-full md:w-auto mt-2 md:mt-0">
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value as SendStatus)}
            disabled={savingStatus}
            className={`h-8 appearance-none rounded-full border-2 bg-transparent py-0 pl-3 pr-7 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20 disabled:opacity-50 ${STATUS_STYLES[currentStatus]}`}
          >
            {(Object.entries(STATUS_LABELS) as [SendStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <CaretDown size={10} weight="bold" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        {/* Left: Analysis Card */}
        <div className="h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="flex items-center gap-2 border-b border-(--color-border) px-5 py-3.5">
            <Notebook size={15} className="text-(--color-muted)" />
            <h2 className="text-sm font-semibold">企業分析</h2>
            <button
              type="button"
              onClick={() => setShowAnalysis((v) => !v)}
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-(--color-muted) transition-colors hover:bg-(--color-card-hover) md:hidden"
            >
              {showAnalysis ? "閉じる" : "詳細を見る"}
              <CaretDown size={12} weight="bold" className={`transition-transform ${showAnalysis ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className={`${showAnalysis ? "block" : "hidden"} md:block`}>
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">会社名</p>
              <p className="mt-1 text-[15px] font-semibold">{prospect.company_name || "-"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">事業概要</p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                {analysis?.business_summary || "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">提案ポイント</p>
              {analysis && analysis.proposal_points.length > 0 ? (
                <ul className="mt-1.5 space-y-2">
                  {analysis.proposal_points.map((point, index) => (
                    <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-primary)" />
                      {point}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">-</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-(--color-border) px-5 py-3.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${compatStyle}`}>
              {COMPATIBILITY_LABELS[prospect.compatibility_score] ?? prospect.compatibility_score}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                相性: {COMPATIBILITY_LABELS[prospect.compatibility_score] ?? prospect.compatibility_score}
              </p>
              {analysis?.compatibility.reason && (
                <p className="mt-0.5 text-[12px] leading-snug text-gray-500 dark:text-gray-400">
                  {analysis.compatibility.reason}
                </p>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Right: Mail Editor */}
        <div>
          <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3.5">
              <div className="flex items-center gap-2">
                <EnvelopeSimple size={15} className="text-(--color-muted)" />
                <h2 className="text-sm font-semibold">メール</h2>
              </div>
              {prospect.is_form_only === 1 && (
                <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                  フォーム用文面
                </span>
              )}
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="subject" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">件名</label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
              <div>
                <label htmlFor="body" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">本文</label>
                <textarea
                  id="body"
                  rows={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[220px] w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-3 text-[13px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
                <p className="mt-1 text-right text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                  {bodyCharCount}文字
                </p>
              </div>
            </div>

            {prospect.form_url && (
              <div className="border-t border-(--color-border) bg-gray-50/50 px-5 py-3.5 dark:bg-slate-800/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">フォームURL</p>
                <a href={prospect.form_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-[13px] text-(--color-primary) underline underline-offset-2 hover:text-(--color-primary-hover)">
                  {prospect.form_url}
                </a>
              </div>
            )}

            {emailsFound.length > 0 && (
              <div className="border-t border-(--color-border) bg-gray-50/50 px-5 py-3.5 dark:bg-slate-800/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">送信先</p>
                {emailsFound.map((email) => (
                  <p key={email} className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">{email}</p>
                ))}
              </div>
            )}

            {/* Sender selector */}
            {senders.length > 0 && (
              <div className="border-t border-(--color-border) bg-gray-50/50 px-5 py-3.5 dark:bg-slate-800/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">送信元アカウント</p>
                <select
                  value={selectedSenderId ?? ""}
                  onChange={(e) => setSelectedSenderId(Number(e.target.value))}
                  className="mt-1 h-9 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ? `${s.display_name} (${s.email})` : s.email}
                      {s.auth_status !== "connected" ? " [要再認証]" : ""}
                    </option>
                  ))}
                </select>

                {/* F14: 日程調整リンク。1通目には入れない前提なので既定OFF */}
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[13px] text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={includeBookingLink}
                    onChange={(e) => setIncludeBookingLink(e.target.checked)}
                    disabled={!selectedSender?.booking_url}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-(--color-primary) disabled:cursor-not-allowed"
                  />
                  <span>
                    日程調整リンクを添える
                    <span className="mt-0.5 block text-[11px] text-(--color-muted)">
                      {selectedSender?.booking_url
                        ? "1通目は入れずに2通目以降で使うのが推奨です"
                        : "設定ページで日程調整URLを登録すると使えます"}
                    </span>
                  </span>
                </label>
              </div>
            )}

            {/* Send Error */}
            {sendError && (
              <div className="border-t border-(--color-danger)/30 bg-(--color-danger-light) px-5 py-3.5">
                <div className="flex items-start gap-2">
                  <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-(--color-danger)" />
                  <p className="whitespace-pre-line text-[13px] font-medium text-(--color-danger)">{sendError}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-(--color-border) bg-white/95 backdrop-blur-sm dark:bg-slate-900/95 md:hidden">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          <button type="button" onClick={handleRegenerate} disabled={regenerating} className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-muted) transition-colors hover:bg-(--color-card-hover) hover:text-(--color-primary) disabled:opacity-50">
            <ArrowCounterClockwise size={18} className={regenerating ? "animate-spin" : ""} />
            <span className="text-[10px]">再生成</span>
          </button>
          <button type="button" onClick={handleCopy} className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-muted) transition-colors hover:bg-(--color-card-hover) hover:text-(--color-primary)">
            <Copy size={18} />
            <span className="text-[10px]">コピー</span>
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-muted) transition-colors hover:bg-(--color-card-hover) hover:text-(--color-primary) disabled:opacity-50">
            {saving ? <SpinnerGap size={18} className="animate-spin" /> : <Check size={18} weight="bold" />}
            <span className="text-[10px]">{saving ? "保存中" : "保存"}</span>
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !canSend}
            className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-primary) font-medium transition-colors disabled:opacity-50"
          >
            {sending ? <SpinnerGap size={18} className="animate-spin" /> : <PaperPlaneTilt size={18} weight="fill" />}
            <span className="text-[10px] font-semibold">{sending ? "送信中" : "送信"}</span>
          </button>
        </div>
      </div>

      {/* Desktop Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 hidden border-t border-(--color-border) bg-white/90 backdrop-blur-sm dark:bg-slate-900/90 md:block">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-6 py-3">
          <button type="button" onClick={handleRegenerate} disabled={regenerating}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300">
            <ArrowCounterClockwise size={15} className={regenerating ? "animate-spin" : ""} />
            {regenerating ? "再生成中..." : "再生成"}
          </button>
          <button type="button" onClick={handleFollowUp} disabled={followingUp}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300">
            <EnvelopeSimple size={15} className={followingUp ? "animate-spin" : ""} />
            {followingUp ? "生成中..." : "フォローアップ"}
          </button>
          <button type="button" onClick={handleCopy}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) dark:text-gray-300">
            <Copy size={15} />
            コピー
          </button>
          <button type="button" onClick={handleSaveTemplate}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) dark:text-gray-300">
            <BookmarkSimple size={15} />
            テンプレ保存
          </button>
          {prospect.form_url && (
            <button type="button" onClick={handleOpenForm}
              className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) dark:text-gray-300">
              <ArrowSquareOut size={15} />
              フォームを開く
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300">
            {saving ? <SpinnerGap size={15} className="animate-spin" /> : <Check size={15} weight="bold" />}
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !canSend}
            className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? <SpinnerGap size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} weight="fill" />}
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
