"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowCounterClockwise,
  BookmarkSimple,
  CaretDown,
  Check,
  Copy,
  EnvelopeSimple,
  Globe,
  Notebook,
  PaperPlaneTilt,
  Prohibit,
  SpinnerGap,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AnalysisResult, Prospect, SendStatus } from "@/lib/types";
import { validateEmail } from "@/lib/quality-check";
import { Toast } from "@/components/toast";
import { CARD } from "@/components/ui-kit";

const COMPATIBILITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const COMPATIBILITY_BG: Record<string, string> = {
  high: "bg-(--color-success-light) text-(--color-success-text)",
  medium: "bg-(--color-warning-light) text-(--color-warning-text)",
  low: "bg-(--color-danger-light) text-(--color-danger-text)",
};

const STATUS_LABELS: Record<SendStatus, string> = {
  unsent: "未送信",
  scheduled: "予約済",
  sent: "送信済",
  failed: "送信失敗",
  replied: "返信あり",
  meeting: "商談中",
  rejected: "見送り",
};

const STATUS_STYLES: Record<SendStatus, string> = {
  unsent: "border-gray-300 text-(--color-muted) dark:border-gray-600",
  scheduled: "border-(--color-primary) text-(--color-primary-text)",
  sent: "border-(--color-primary) text-(--color-primary-text)",
  failed: "border-(--color-danger) text-(--color-danger-text)",
  replied: "border-(--color-success) text-(--color-success-text)",
  meeting: "border-(--color-warning) text-(--color-warning-text)",
  rejected: "border-(--color-danger) text-(--color-danger-text)",
};

/** 下部バーの補助ボタン（進む操作の青と見た目を分ける） */
const BAR_BTN =
  "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-(--color-foreground) transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:text-(--color-primary-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50";

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

/**
 * 直後に confirm を出す前に、いま画面に出した1文を必ず描き切らせる。
 * confirm はJSを止めるので、待たないと「読む前にダイアログ」になる。
 */
function waitForPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(done));
    }
    // 背面タブなどで rAF が止まっていても先へ進めるための保険
    setTimeout(done, 120);
  });
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
  /** 送信直前に画面へ出す平易な1文（confirm の前に読ませる） */
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  const [followingUp, setFollowingUp] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const [senders, setSenders] = useState<SenderInfo[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  // F14: 仕様書どおり既定OFF（1通目にカレンダーリンクを入れると返信率が下がる）
  const [includeBookingLink, setIncludeBookingLink] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [hasRefusal, setHasRefusal] = useState(false);
  const [refusalText, setRefusalText] = useState<string | null>(null);

  const [suppressing, setSuppressing] = useState(false);
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

  // 生成時の品質チェック結果はAPIが返すがUIが捨てていたため、レビュー画面で
  // 純関数 validateEmail を再計算して表示する。編集のたびに追従する。
  const qualityIssues = useMemo<string[]>(
    () =>
      analysis
        ? validateEmail(body, subject, analysis, {
            fromTemplate: Boolean(prospect?.template_id),
          }).issues
        : [],
    [analysis, body, subject, prospect]
  );

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

  async function handleSuppress() {
    if (!prospect) return;
    const domain = prospect.domain;
    if (!domain) { showToast("ドメインが不明です"); return; }
    if (!confirm(`${domain} を送信しないリストに追加しますか？`)) return;
    setSuppressing(true);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: domain, target_type: "domain", reason: "manual", note: `prospect #${id} から追加` }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "登録に失敗しました" }));
        throw new Error(data.error || "登録に失敗しました");
      }
      showToast(`${domain} を送信しないリストに追加しました`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSuppressing(false);
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

    // 確認ダイアログの前に「これから何が起きるか」を画面に出して読ませる
    const target = prospect?.company_name || prospect?.domain || "この会社";
    setSendNotice(`今から${target}へ実際にメールを送ります。宛先: ${emailsFound[0]}`);
    await waitForPaint();

    if (hasRefusal && !confirm("この企業は「営業お断り」を表明しています。送信すると特定電子メール法に違反する可能性があります。本当に送信しますか？")) {
      setSendNotice(null);
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
      setSendNotice(null);
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">メール確認</h1>
        <div className={`${CARD} flex flex-col items-center justify-center gap-3 py-20 text-center`}>
          <SpinnerGap size={20} className="animate-spin text-(--color-primary-text)" />
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
          <WarningCircle size={24} weight="fill" className="text-(--color-danger-text)" />
          <p className="text-sm font-medium text-(--color-danger-text)">
            {loadError ?? "データが見つかりませんでした。"}
          </p>
        </div>
      </div>
    );
  }

  const compatStyle = COMPATIBILITY_BG[prospect.compatibility_score] ?? "bg-(--color-card-hover) text-(--color-muted)";
  const currentStatus = (prospect.send_status || "unsent") as SendStatus;
  const canSend = senders.length > 0 && emailsFound.length > 0 && currentStatus === "unsent";
  const selectedSender = senders.find((s) => s.id === selectedSenderId);
  const companyLabel = prospect.company_name || prospect.domain;

  /** 送信直前の平易な1文。下部バーの真上に出す（モバイル/デスクトップで1つずつ） */
  const noticeStrip = sendNotice ? (
    <div className="flex items-start gap-2 border-b border-(--color-primary)/30 bg-(--color-primary-light) px-4 py-2 text-[13px] font-medium text-(--color-primary-text)">
      <PaperPlaneTilt size={14} weight="fill" className="mt-0.5 shrink-0" />
      <span className="min-w-0">{sendNotice}</span>
    </div>
  ) : null;

  return (
    <div className="animate-fade-in pb-24">
      {/* パンくず: 履歴 ‹ 会社名 */}
      <nav aria-label="パンくず" className="mb-2 flex min-w-0 items-center gap-2 text-[13px]">
        <Link
          href="/history"
          className="rounded-md text-(--color-primary-text) underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
        >
          履歴
        </Link>
        <span aria-hidden="true" className="text-(--color-muted)">
          ‹
        </span>
        <span className="truncate font-medium text-(--color-muted)">{companyLabel}</span>
      </nav>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight text-balance md:text-xl">
          {companyLabel} 宛のメール
        </h1>
        <span className="hidden items-center gap-1.5 rounded-full bg-(--color-primary-light) px-3 py-1 text-xs font-semibold text-(--color-primary-text) md:inline-flex">
          <Globe size={12} />
          {prospect.domain}
        </span>

        {/* Actions */}
        <div className="ml-auto mt-2 flex flex-wrap items-center gap-2 md:mt-0">
          <div className="relative">
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value as SendStatus)}
              disabled={savingStatus}
              aria-label="ステータス"
              className={`h-9 appearance-none rounded-full border-2 bg-transparent py-0 pl-3 pr-7 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20 disabled:opacity-50 ${STATUS_STYLES[currentStatus]}`}
            >
              {(Object.entries(STATUS_LABELS) as [SendStatus, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <CaretDown size={10} weight="bold" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="button"
            onClick={handleSuppress}
            disabled={suppressing}
            title="この会社へ二度と送れなくなります"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-danger)/40 px-3 text-xs font-medium text-(--color-danger-text) transition-colors motion-reduce:transition-none hover:bg-(--color-danger-light) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-danger) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Prohibit size={13} weight="bold" />
            送信しないリストに追加
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left: Mail Editor（主役） */}
        <div className="min-w-0">
          {/* Test Mode Banner */}
          {isTestMode && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-(--color-danger) px-4 py-2.5 text-sm font-semibold text-white">
              <Warning size={16} weight="bold" />
              テストモード: 宛先はテストアドレスに強制上書きされます
            </div>
          )}

          {/* Refusal Warning */}
          {hasRefusal && (
            <div className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-600 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-(--color-warning-text)" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    営業お断りの表記が検出されました
                  </p>
                  {refusalText && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      「{refusalText}」
                    </p>
                  )}
                  <p className="mt-1 text-xs text-(--color-warning-text)">
                    送信すると特定電子メール法に違反する可能性があります。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 品質チェック（送信はブロックしない・気づきのための表示） */}
          {qualityIssues.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <Warning size={13} weight="bold" />
                品質チェック（{qualityIssues.length}件）
              </p>
              <ul className="mt-1.5 space-y-1">
                {qualityIssues.map((issue, i) => (
                  <li key={i} className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">・{issue}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-(--color-warning-text)/80">
                送信はブロックしません。気になる項目は本文を直すか再生成してください。
              </p>
            </div>
          )}

          <div className={`${CARD} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3.5">
              <div className="flex items-center gap-2">
                <EnvelopeSimple size={15} className="text-(--color-muted)" />
                <h2 className="text-sm font-semibold">メール</h2>
              </div>
              {prospect.is_form_only === 1 && (
                <span className="rounded-md bg-(--color-card-hover) px-2 py-1 text-[10px] font-semibold text-(--color-muted)">
                  フォーム用文面
                </span>
              )}
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="subject" className="mb-1.5 block text-[13px] font-medium text-(--color-foreground)">件名</label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-11 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25"
                />
              </div>
              <div>
                <label htmlFor="body" className="mb-1.5 block text-[13px] font-medium text-(--color-foreground)">本文</label>
                <textarea
                  id="body"
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[260px] w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-3 text-[14px] leading-[1.8] text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25"
                />
                <p className="mt-1 text-right text-[11px] tabular-nums text-(--color-muted)">
                  {bodyCharCount}文字
                </p>
              </div>
            </div>

            {prospect.form_url && (
              <div className="border-t border-(--color-border) bg-(--color-card-hover)/50 px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">フォームURL</p>
                <a href={prospect.form_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-[13px] text-(--color-primary-text) underline underline-offset-2 hover:text-(--color-primary-hover)">
                  {prospect.form_url}
                </a>
              </div>
            )}

            {emailsFound.length > 0 && (
              <div className="border-t border-(--color-border) bg-(--color-card-hover)/50 px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">宛先</p>
                {emailsFound.map((email) => (
                  <p key={email} className="mt-0.5 text-[13px] text-(--color-muted)">{email}</p>
                ))}
              </div>
            )}

            {/* Sender selector */}
            {senders.length > 0 && (
              <div className="border-t border-(--color-border) bg-(--color-card-hover)/50 px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">送信元アカウント</p>
                <select
                  value={selectedSenderId ?? ""}
                  onChange={(e) => setSelectedSenderId(Number(e.target.value))}
                  aria-label="送信元アカウント"
                  className="mt-1 h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25"
                >
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ? `${s.display_name} (${s.email})` : s.email}
                      {s.auth_status !== "connected" ? " [要再認証]" : ""}
                    </option>
                  ))}
                </select>

                {/* F14: 日程調整リンク。1通目には入れない前提なので既定OFF */}
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[13px] text-(--color-foreground)">
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
                  <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-(--color-danger-text)" />
                  <p className="whitespace-pre-line text-[13px] font-medium text-(--color-danger-text)">{sendError}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Analysis Card */}
        <div className={`${CARD} h-fit overflow-hidden`}>
          <div className="flex items-center gap-2 border-b border-(--color-border) px-5 py-3.5">
            <Notebook size={15} className="text-(--color-muted)" />
            <h2 className="text-sm font-semibold">企業分析</h2>
            <button
              type="button"
              onClick={() => setShowAnalysis((v) => !v)}
              aria-expanded={showAnalysis}
              className="ml-auto flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) md:hidden"
            >
              {showAnalysis ? "閉じる" : "詳細を見る"}
              <CaretDown size={12} weight="bold" className={`transition-transform ${showAnalysis ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className={`${showAnalysis ? "block" : "hidden"} md:block`}>
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-muted)">会社名</p>
              <p className="mt-1 text-[15px] font-semibold">{prospect.company_name || "-"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-muted)">事業概要</p>
              <p className="mt-1 text-[13px] leading-relaxed text-(--color-muted)">
                {analysis?.business_summary || "-"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-muted)">提案ポイント</p>
              {analysis && analysis.proposal_points.length > 0 ? (
                <ul className="mt-1.5 space-y-2">
                  {analysis.proposal_points.map((point, index) => (
                    <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-(--color-muted)">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-primary)" />
                      {point}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-(--color-muted)">-</p>
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
                <p className="mt-0.5 text-[12px] leading-snug text-(--color-muted)">
                  {analysis.compatibility.reason}
                </p>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Mobile Action Bar（現行どおり4項目） */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-(--color-border) bg-(--color-card)/95 backdrop-blur-sm md:hidden">
        {noticeStrip}
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          <button type="button" onClick={handleRegenerate} disabled={regenerating} className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-primary-text) disabled:opacity-50">
            <ArrowCounterClockwise size={18} className={regenerating ? "animate-spin" : ""} />
            <span className="text-[10px]">再生成</span>
          </button>
          <button type="button" onClick={handleCopy} className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-primary-text)">
            <Copy size={18} />
            <span className="text-[10px]">コピー</span>
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-primary-text) disabled:opacity-50">
            {saving ? <SpinnerGap size={18} className="animate-spin" /> : <Check size={18} weight="bold" />}
            <span className="text-[10px]">{saving ? "保存中" : "保存"}</span>
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !canSend}
            className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-2 font-medium text-(--color-primary-text) transition-colors motion-reduce:transition-none disabled:opacity-50"
          >
            {sending ? <SpinnerGap size={18} className="animate-spin" /> : <PaperPlaneTilt size={18} weight="fill" />}
            <span className="text-[10px] font-semibold">{sending ? "送信中" : "送信"}</span>
          </button>
        </div>
      </div>

      {/* Desktop Action Bar（6項目）。左サイドバーの幅だけ内側に寄せる（下に隠れないように） */}
      <div className="fixed inset-x-0 bottom-0 z-10 hidden border-t border-(--color-border) bg-(--color-card)/95 backdrop-blur-sm md:block md:pl-16 xl:pl-60">
        {noticeStrip}
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-6 py-3">
          <button type="button" onClick={handleRegenerate} disabled={regenerating} className={BAR_BTN}>
            <ArrowCounterClockwise size={15} className={regenerating ? "animate-spin" : ""} />
            {regenerating ? "再生成中..." : "再生成"}
          </button>
          <button type="button" onClick={handleFollowUp} disabled={followingUp} className={BAR_BTN}>
            <EnvelopeSimple size={15} className={followingUp ? "animate-spin" : ""} />
            {followingUp ? "生成中..." : "フォローアップ"}
          </button>
          <button type="button" onClick={handleCopy} className={BAR_BTN}>
            <Copy size={15} />
            コピー
          </button>
          <button type="button" onClick={handleSaveTemplate} className={BAR_BTN}>
            <BookmarkSimple size={15} />
            テンプレ保存
          </button>
          <div className="flex-1" />
          <button type="button" onClick={handleSave} disabled={saving} className={BAR_BTN}>
            {saving ? <SpinnerGap size={15} className="animate-spin" /> : <Check size={15} weight="bold" />}
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !canSend}
            className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-(--color-primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-background) disabled:cursor-not-allowed disabled:opacity-60"
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
