"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { AnalysisResult, Prospect } from "@/lib/types";

const COMPATIBILITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const COMPATIBILITY_STYLES: Record<string, string> = {
  high: "bg-green-100 text-[--color-success]",
  medium: "bg-amber-100 text-[--color-warning]",
  low: "bg-red-100 text-[--color-danger]",
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
      <div>
        <h1 className="text-2xl font-bold mb-6">メール確認</h1>
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (loadError || !prospect) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">メール確認</h1>
        <div className="rounded-lg border border-[--color-danger] bg-red-50 p-4 text-sm text-[--color-danger]">
          {loadError ?? "データが見つかりませんでした。"}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <h1 className="text-2xl font-bold mb-6">
        {prospect.company_name || prospect.domain} 宛のメール
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">企業分析</h2>

          <div>
            <p className="text-sm font-medium text-gray-500">会社名</p>
            <p className="mt-0.5">{prospect.company_name || "-"}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">事業概要</p>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-700">
              {analysis?.business_summary || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">相性</p>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                COMPATIBILITY_STYLES[prospect.compatibility_score] ??
                "bg-gray-100 text-gray-600"
              }`}
            >
              {COMPATIBILITY_LABELS[prospect.compatibility_score] ??
                prospect.compatibility_score}
            </span>
            {analysis?.compatibility.reason && (
              <p className="mt-2 text-sm text-gray-600">
                {analysis.compatibility.reason}
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">
              提案ポイント
            </p>
            {analysis && analysis.proposal_points.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                {analysis.proposal_points.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">-</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">メール</h2>
            {prospect.is_form_only === 1 && (
              <span className="text-xs font-medium bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5">
                フォーム用文面
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              件名
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-[--color-border] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              本文
            </label>
            <textarea
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border border-[--color-border] rounded-lg px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400 text-right">
              {bodyCharCount}文字
            </p>
          </div>

          {emailsFound.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">送信先</p>
              <ul className="text-sm text-gray-600 space-y-0.5">
                {emailsFound.map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            </div>
          )}

          {prospect.form_url && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                フォームURL
              </p>
              <a
                href={prospect.form_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[--color-primary] underline underline-offset-2 break-all"
              >
                {prospect.form_url}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-4 mt-6 bg-white rounded-lg shadow-lg border border-[--color-border] p-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          {regenerating ? "再生成中..." : "再生成"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
        >
          コピー
        </button>
        <button
          type="button"
          onClick={handleOpenGmail}
          className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
        >
          Gmailで開く
        </button>
        {prospect.form_url && (
          <button
            type="button"
            onClick={handleOpenForm}
            className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
          >
            フォームを開く
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="ml-auto bg-[--color-primary] hover:bg-[--color-primary-hover] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
