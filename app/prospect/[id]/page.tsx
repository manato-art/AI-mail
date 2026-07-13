"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Buildings,
  Check,
  Copy,
  EnvelopeSimple,
  Globe,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AnalysisResult, Prospect } from "@/lib/types";

const COMPATIBILITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const COMPATIBILITY_STYLES: Record<string, string> = {
  high: "bg-(--color-success-light) text-(--color-success)",
  medium: "bg-(--color-warning-light) text-(--color-warning)",
  low: "bg-(--color-danger-light) text-(--color-danger)",
};

const GMAIL_URL_MAX_LENGTH = 2000;

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
  const id = params.id;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

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
        const res = await fetch(`/api/prospects/${id}`);
        if (!res.ok) throw new Error("データの取得に失敗しました。");
        const data: Prospect = await res.json();
        if (!cancelled) {
          setProspect(data);
          setSubject(data.subject);
          setBody(data.body);
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
    let gmailUrl = `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(
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

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {prospect.company_name || prospect.domain} 宛のメール
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-card) px-3 py-1 text-xs font-medium text-(--color-muted)">
          <Globe size={14} />
          {prospect.domain}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
        <div className="h-fit rounded-xl border border-(--color-border) bg-(--color-card) p-6">
          <div className="mb-5 flex items-center gap-2">
            <Buildings size={16} className="text-(--color-muted)" />
            <h2 className="text-base font-semibold">企業分析</h2>
          </div>

          <dl className="space-y-5">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-(--color-muted)">
                会社名
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {prospect.company_name || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-(--color-muted)">
                事業概要
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {analysis?.business_summary || "-"}
              </dd>
            </div>

            <div>
              <dt className="mb-1.5 text-xs font-medium uppercase tracking-wider text-(--color-muted)">
                相性
              </dt>
              <dd>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                    COMPATIBILITY_STYLES[prospect.compatibility_score] ??
                    "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {COMPATIBILITY_LABELS[prospect.compatibility_score] ??
                    prospect.compatibility_score}
                </span>
                {analysis?.compatibility.reason && (
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {analysis.compatibility.reason}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className="mb-1.5 text-xs font-medium uppercase tracking-wider text-(--color-muted)">
                提案ポイント
              </dt>
              <dd>
                {analysis && analysis.proposal_points.length > 0 ? (
                  <ul className="space-y-2">
                    {analysis.proposal_points.map((point, index) => (
                      <li
                        key={index}
                        className="flex gap-2 text-sm leading-relaxed text-gray-700"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-(--color-muted)" />
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">-</p>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-5 rounded-xl border border-(--color-border) bg-(--color-card) p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EnvelopeSimple size={16} className="text-(--color-muted)" />
              <h2 className="text-base font-semibold">メール</h2>
            </div>
            {prospect.is_form_only === 1 && (
              <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                フォーム用文面
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="subject"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              件名
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-11 w-full rounded-lg border border-(--color-border) px-3.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
            />
          </div>

          <div>
            <label
              htmlFor="body"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              本文
            </label>
            <textarea
              id="body"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[260px] w-full rounded-lg border border-(--color-border) px-3.5 py-3 text-sm leading-relaxed focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
            />
            <p className="mt-1.5 text-right text-xs text-gray-400 dark:text-gray-500">
              {bodyCharCount}文字
            </p>
          </div>

          {emailsFound.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">送信先</p>
              <ul className="space-y-0.5">
                {emailsFound.map((email) => (
                  <li key={email} className="text-sm text-gray-600 dark:text-gray-400">
                    {email}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prospect.form_url && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                フォームURL
              </p>
              <a
                href={prospect.form_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-(--color-primary) underline underline-offset-2 hover:text-(--color-primary-hover)"
              >
                {prospect.form_url}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-(--color-border) bg-white/85 dark:bg-slate-900/85 px-4 py-4 backdrop-blur-sm lg:-mx-6 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowCounterClockwise
              size={16}
              className={regenerating ? "animate-spin" : ""}
            />
            {regenerating ? "再生成中..." : "再生成"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover)"
          >
            <Copy size={16} />
            コピー
          </button>
          <button
            type="button"
            onClick={handleOpenGmail}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover)"
          >
            <ArrowSquareOut size={16} />
            Gmailで開く
          </button>
          {prospect.form_url && (
            <button
              type="button"
              onClick={handleOpenForm}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-(--color-card-hover)"
            >
              <ArrowSquareOut size={16} />
              フォームを開く
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
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
