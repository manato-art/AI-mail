"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowSquareOut,
  CalendarCheck,
  CheckCircle,
  Clock,
  MagnifyingGlass,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type { SendEvidence, SendStatus } from "@/lib/types";
import { diffMinutes, formatJst, formatJstFromMs } from "@/lib/datetime";

/**
 * 「本当に送られたのか・いつ送られたのか」を確かめるカード。
 *
 * 出すのは2種類の情報で、根拠の強さが違うことを画面でも区別する:
 *  - **アプリの記録**（send_log）… Gmailが受理した瞬間に書かれる記録。予約送信でも同じ経路で書かれる
 *  - **Gmailの記録**（照合ボタン）… Gmail側の実物から取った受理時刻・宛先・件名。こちらが最終的な根拠
 *
 * ステータス（送信済ラベル）は手で書き換えられる申告なので、根拠としては扱わない。
 */

interface VerifyResult {
  logId: number;
  status: "verified" | "not_found" | "no_message_id" | "sender_missing" | "reauth_required" | "error";
  gmailSentAtMs?: number | null;
  gmailTo?: string | null;
  gmailSubject?: string | null;
  inSentBox?: boolean;
  threadId?: string | null;
  toMatches?: boolean;
  subjectMatches?: boolean;
}

interface SendLogResponse {
  scheduledAt: string | null;
  sendStatus: SendStatus;
  logs: SendEvidence[];
}

const VERIFY_LABELS: Record<VerifyResult["status"], string> = {
  verified: "Gmailの記録と照合できました",
  not_found: "Gmailにこのメールが見つかりません（削除された可能性）",
  no_message_id: "GmailメッセージIDが記録されていません（このアプリ以外で送った記録の可能性）",
  sender_missing: "送信に使ったアカウントが削除されています",
  reauth_required: "Gmailの再認証が必要です（設定 → 送信アカウント）",
  error: "Gmailへの問い合わせに失敗しました",
};

function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`;
}

export function SendRecord({ prospectId }: { prospectId: number }) {
  const [data, setData] = useState<SendLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, VerifyResult>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prospects/${prospectId}/send-log`);
        if (!res.ok) return;
        const json = (await res.json()) as SendLogResponse;
        if (!cancelled) setData(json);
      } catch {
        // 取得できなければカードを出さないだけ（本文の閲覧・送信は妨げない）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectId]);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/send-log/verify`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setVerifyError(json.error ?? "照合に失敗しました");
        return;
      }
      const map: Record<number, VerifyResult> = {};
      for (const r of (json.results ?? []) as VerifyResult[]) map[r.logId] = r;
      setResults(map);
    } catch {
      setVerifyError("照合に失敗しました（通信エラー）");
    } finally {
      setVerifying(false);
    }
  }, [prospectId]);

  if (loading || !data) return null;

  const { logs, scheduledAt, sendStatus } = data;
  // 送信も予約もしていないなら出さない（空のカードで画面を埋めない）
  if (logs.length === 0 && !scheduledAt) return null;

  return (
    <section
      aria-labelledby="send-record-title"
      className="mb-4 overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-4 py-3">
        <h2 id="send-record-title" className="flex items-center gap-1.5 text-[15px] font-semibold">
          <CheckCircle size={16} weight="fill" className="text-(--color-success-text)" />
          送信の記録
        </h2>
        {logs.some((l) => l.gmail_message_id) && (
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) disabled:opacity-50"
          >
            {verifying ? <SpinnerGap size={13} className="animate-spin" /> : <MagnifyingGlass size={13} weight="bold" />}
            Gmailの記録と照合する
          </button>
        )}
      </div>

      <div className="space-y-3 px-4 py-3.5">
        {/* 予約: 予定時刻と、実際に送られたかどうか */}
        {scheduledAt && (
          <div className="flex items-start gap-2 rounded-lg bg-(--color-primary-light) px-3 py-2.5">
            <CalendarCheck size={15} weight="fill" className="mt-0.5 shrink-0 text-(--color-primary-text)" />
            <div className="text-[13px] leading-relaxed text-(--color-primary-text)">
              <p>
                <span className="font-semibold">送信予約</span>：{formatJst(scheduledAt, "dateTime")}
                <span className="ml-1 text-[11px]">（日本時間）</span>
              </p>
              {sendStatus === "scheduled" && logs.length === 0 && (
                <p className="mt-0.5">この時刻になるまで、まだ送っていません。</p>
              )}
            </div>
          </div>
        )}

        {logs.length === 0 ? (
          <p className="text-[13px] text-(--color-muted)">
            送信の記録はまだありません（このアプリから送信すると、ここに時刻とGmailの控えが残ります）。
          </p>
        ) : (
          <ol className="space-y-3">
            {logs.map((log, index) => {
              const result = results[log.id];
              // 予約に対する実際の送信のズレ（予約が無ければ出さない）
              const lag = index === logs.length - 1 ? diffMinutes(log.sent_at, scheduledAt) : null;
              return (
                <li key={log.id} className="rounded-lg border border-(--color-border) px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Clock size={14} weight="bold" className="shrink-0 text-(--color-muted)" />
                    <p className="text-[15px] font-semibold tabular-nums">
                      {formatJst(log.sent_at, "dateTimeSec")}
                    </p>
                    <span className="text-[11px] text-(--color-muted)">に送信（日本時間・アプリの記録）</span>
                    {logs.length > 1 && (
                      <span className="rounded bg-(--color-card-hover) px-1.5 py-0.5 text-[10px] font-medium text-(--color-muted)">
                        {logs.length - index}通目
                      </span>
                    )}
                  </div>

                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-(--color-muted)">宛先</dt>
                    <dd className="min-w-0 break-all">{log.to_email}</dd>
                    <dt className="text-(--color-muted)">送信元</dt>
                    <dd className="min-w-0 break-all">{log.sender_email ?? "（削除されたアカウント）"}</dd>
                    <dt className="text-(--color-muted)">件名</dt>
                    <dd className="min-w-0">{log.subject}</dd>
                    <dt className="text-(--color-muted)">GmailメッセージID</dt>
                    <dd className="min-w-0 break-all font-mono text-[11px]">
                      {log.gmail_message_id ?? "（記録なし）"}
                    </dd>
                  </dl>

                  {lag !== null && (
                    <p className="mt-1.5 text-[12px] text-(--color-muted)">
                      予約時刻との差：
                      {lag === 0 ? "ぴったり" : lag > 0 ? `${lag}分遅れ` : `${Math.abs(lag)}分早い`}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {log.gmail_thread_id && (
                      <a
                        href={gmailThreadUrl(log.gmail_thread_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-(--color-primary-text) underline underline-offset-2 hover:text-(--color-primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                      >
                        Gmailで実物を開く
                        <ArrowSquareOut size={13} weight="bold" />
                      </a>
                    )}
                  </div>

                  {/* Gmail 側の記録（照合結果）。こちらが最終的な根拠 */}
                  {result && (
                    <div
                      className={`mt-2.5 rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                        result.status === "verified"
                          ? "bg-(--color-success-light) text-(--color-success-text)"
                          : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 font-semibold">
                        {result.status === "verified" ? (
                          <CheckCircle size={14} weight="fill" />
                        ) : (
                          <Warning size={14} weight="fill" />
                        )}
                        {VERIFY_LABELS[result.status]}
                      </p>
                      {result.status === "verified" && (
                        <ul className="mt-1 space-y-0.5">
                          <li>
                            Gmailが受け付けた時刻：
                            <span className="font-semibold tabular-nums">
                              {formatJstFromMs(result.gmailSentAtMs)}
                            </span>
                            （日本時間）
                          </li>
                          <li>送信済みトレイに存在：{result.inSentBox ? "あり" : "なし"}</li>
                          <li>宛先の一致：{result.toMatches ? "一致" : "不一致"}</li>
                          <li>件名の一致：{result.subjectMatches ? "一致" : "不一致"}</li>
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {verifyError && (
          <p className="text-[13px] text-(--color-danger-text)">{verifyError}</p>
        )}
      </div>
    </section>
  );
}
