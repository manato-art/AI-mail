"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  CaretLeft,
  Check,
  Copy,
  EnvelopeSimple,
  Globe,
  Notebook,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AnalysisResult, Prospect } from "@/lib/types";

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

const GMAIL_URL_MAX_LENGTH = 32000;

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
  const mainText =
    separatorIndex === -1 ? body : body.slice(0, separatorIndex);
  return mainText.trim().length;
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

  const [senderEmail, setSenderEmail] = useState("");

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [res, settingsRes] = await Promise.all([
          fetch(`/api/prospects/${id}`),
          fetch("/api/settings"),
        ]);
        if (!res.ok) throw new Error("データの取得に失敗しました。");
        const data: Prospect = await res.json();
        const settings = settingsRes.ok ? await settingsRes.json() : {};
        if (!cancelled) {
          setProspect(data);
          setSubject(data.subject);
          setBody(data.body);
          if (settings.sender_email) setSenderEmail(settings.sender_email);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "データの取得に失敗しました。"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
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
      const res = await fetch(`/api/prospects/${id}/regenerate`, {
        method: "POST",
      });
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      showToast("コピーしました");
    } catch {
      showToast("コピーに失敗しました");
    }
  }

  function handleOpenGmail() {
    let gmailUrl = `https://mail.google.com/mail/?${senderEmail ? `authuser=${encodeURIComponent(senderEmail)}&` : ""}view=cm&su=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    if (emailsFound.length > 0) {
      gmailUrl += `&to=${encodeURIComponent(emailsFound[0])}`;
    }
    if (gmailUrl.length > GMAIL_URL_MAX_LENGTH) {
      showToast("URLが長すぎるためコピーをお使いください");
      return;
    }
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
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

  const compatStyle = COMPATIBILITY_BG[prospect.compatibility_score] ?? "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400";

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <h1 className="text-xl font-bold tracking-tight">
          {prospect.company_name || prospect.domain} 宛のメール
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-primary-light) px-3 py-1 text-xs font-semibold text-(--color-primary)">
          <Globe size={12} />
          {prospect.domain}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        {/* Left: Analysis Card */}
        <div className="h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="flex items-center gap-2 border-b border-(--color-border) px-5 py-3.5">
            <Notebook size={15} className="text-(--color-muted)" />
            <h2 className="text-sm font-semibold">企業分析</h2>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">
                会社名
              </p>
              <p className="mt-1 text-[15px] font-semibold">
                {prospect.company_name || "-"}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">
                事業概要
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                {analysis?.business_summary || "-"}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">
                提案ポイント
              </p>
              {analysis && analysis.proposal_points.length > 0 ? (
                <ul className="mt-1.5 space-y-2">
                  {analysis.proposal_points.map((point, index) => (
                    <li
                      key={index}
                      className="flex gap-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400"
                    >
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

          {/* Compatibility Banner */}
          <div className="flex items-center gap-3 border-t border-(--color-border) px-5 py-3.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${compatStyle}`}
            >
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
                <label
                  htmlFor="subject"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)"
                >
                  件名
                </label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>

              <div>
                <label
                  htmlFor="body"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)"
                >
                  本文
                </label>
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">
                  フォームURL
                </p>
                <a
                  href={prospect.form_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block break-all text-[13px] text-(--color-primary) underline underline-offset-2 hover:text-(--color-primary-hover)"
                >
                  {prospect.form_url}
                </a>
              </div>
            )}

            {emailsFound.length > 0 && (
              <div className="border-t border-(--color-border) bg-gray-50/50 px-5 py-3.5 dark:bg-slate-800/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">
                  送信先
                </p>
                {emailsFound.map((email) => (
                  <p key={email} className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">
                    {email}
                  </p>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Fixed Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-(--color-border) bg-white/90 backdrop-blur-sm dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-6 py-3">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300"
          >
            <ArrowCounterClockwise
              size={15}
              className={regenerating ? "animate-spin" : ""}
            />
            {regenerating ? "再生成中..." : "再生成"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) dark:text-gray-300"
          >
            <Copy size={15} />
            コピー
          </button>
          <button
            type="button"
            onClick={handleOpenGmail}
            className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) dark:text-gray-300"
          >
            <ArrowSquareOut size={15} />
            Gmailで開く
          </button>
          {prospect.form_url && (
            <button
              type="button"
              onClick={handleOpenForm}
              className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-card) px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:border-(--color-primary) hover:text-(--color-primary) dark:text-gray-300"
            >
              <ArrowSquareOut size={15} />
              フォームを開く
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <SpinnerGap size={16} className="animate-spin" />
            ) : (
              <Check size={16} weight="bold" />
            )}
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
