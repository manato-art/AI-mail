"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  ArrowsClockwise,
  Buildings,
  CaretLeft,
  CaretRight,
  Check,
  EnvelopeOpen,
  Eye,
  MagicWand,
  PaperPlaneTilt,
  PencilSimple,
  Warning,
} from "@phosphor-icons/react";
import { resolveEmailVariables } from "@/lib/variables";
import type { GeneratedEmail, Recipient } from "../shared";

/**
 * 右側の3状態パネル。
 *  - 生成済み(hasGenerated): 生成結果を編集＋「この宛先に実際に届くメール」
 *  - 直接入力(direct): メール作成＋差し込みプレビュー
 *  - テンプレ(template): 送信プレビュー（{{AI:}} は説明に置き換えて表示）
 */
interface RightPanelProps {
  hasGenerated: boolean;
  previewRecipient: Recipient | undefined;
  generatedEmails: Record<string, GeneratedEmail>;
  isSending: boolean;
  onClearGenerated: () => void;
  onUpdateGenerated: (id: string, field: "subject" | "body", value: string) => void;
  clampedPreviewIndex: number;
  previewCount: number;
  setPreviewIndex: Dispatch<SetStateAction<number>>;
  inputMode: "template" | "direct";
  directSubject: string;
  setDirectSubject: (value: string) => void;
  directBody: string;
  setDirectBody: (value: string) => void;
  directBodyRef: RefObject<HTMLTextAreaElement | null>;
  insertAtCursorDirect: (text: string, cursorBack?: number) => void;
  canQuoteGenerated: boolean;
  onOpenGenerated: () => void;
  buildEmail: (r: Recipient) => { subject: string; body: string; unresolved: string[] };
  hasContent: boolean;
  checkedCount: number;
}

export function RightPanel({
  hasGenerated,
  previewRecipient,
  generatedEmails,
  isSending,
  onClearGenerated,
  onUpdateGenerated,
  clampedPreviewIndex,
  previewCount,
  setPreviewIndex,
  inputMode,
  directSubject,
  setDirectSubject,
  directBody,
  setDirectBody,
  directBodyRef,
  insertAtCursorDirect,
  canQuoteGenerated,
  onOpenGenerated,
  buildEmail,
  hasContent,
  checkedCount,
}: RightPanelProps) {
  return (
    <div className="sticky top-6 h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
      {hasGenerated ? (
        <>
          <div className="flex items-center justify-between border-b border-(--color-border) bg-gray-50 px-5 py-3 dark:bg-slate-700/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <PencilSimple size={15} />
              生成結果を編集
            </h2>
            <button
              type="button"
              onClick={onClearGenerated}
              disabled={isSending}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-(--color-border) px-2 text-[11px] font-medium text-(--color-muted) transition-colors hover:border-(--color-danger) hover:text-(--color-danger) disabled:opacity-40"
            >
              <ArrowsClockwise size={12} />
              やり直し
            </button>
          </div>
          {previewRecipient && generatedEmails[previewRecipient.id] ? (
            <>
              <div className="space-y-2.5 p-4">
                <div className="flex items-center gap-2 rounded-lg bg-(--color-primary-light)/40 px-3 py-1.5">
                  <Buildings size={13} className="shrink-0 text-(--color-primary)" />
                  <span className="truncate text-[12px] font-medium">{previewRecipient.company || previewRecipient.email}</span>
                </div>
                {generatedEmails[previewRecipient.id].warnings?.length ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
                    <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-0.5">
                      {generatedEmails[previewRecipient.id].warnings!.map((w, i) => (
                        <p key={i} className="text-[11px] font-medium leading-snug text-amber-800 dark:text-amber-200">{w}</p>
                      ))}
                      <p className="text-[10px] text-amber-700/80 dark:text-amber-300/70">この宛先は会社ごとの個別文面になっていません。送信前にご確認ください。</p>
                    </div>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</label>
                  <input
                    type="text"
                    value={generatedEmails[previewRecipient.id].subject}
                    onChange={(e) => onUpdateGenerated(previewRecipient.id, "subject", e.target.value)}
                    disabled={isSending}
                    className="h-9 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文</label>
                  <textarea
                    value={generatedEmails[previewRecipient.id].body}
                    onChange={(e) => onUpdateGenerated(previewRecipient.id, "body", e.target.value)}
                    disabled={isSending}
                    rows={14}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-card) p-3 text-[13px] leading-[1.9] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
                  />
                </div>
              </div>
              {(() => {
                const gen = generatedEmails[previewRecipient.id];
                const resolved = resolveEmailVariables(gen.subject, gen.body, {
                  company_name: previewRecipient.company,
                  person_name: previewRecipient.person,
                });
                return (
                  <div className="border-t border-(--color-border) bg-(--color-success-light)/30">
                    <div className="flex items-center gap-1.5 px-4 py-2">
                      <PaperPlaneTilt size={12} weight="fill" className="text-(--color-success)" />
                      <p className="text-[11px] font-bold text-(--color-success)">
                        この宛先に実際に届くメール
                      </p>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto px-4 pb-4">
                      <p className="text-[13px] font-bold text-(--color-foreground)">{resolved.subject}</p>
                      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.9] text-(--color-foreground)">
                        {resolved.body}
                      </p>
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-2.5 dark:bg-slate-700/50">
                <span className="text-[11px] tabular-nums text-(--color-muted)">
                  {clampedPreviewIndex + 1} / {previewCount} 件目
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                    disabled={clampedPreviewIndex === 0}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretLeft size={12} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.min(previewCount - 1, i + 1))}
                    disabled={clampedPreviewIndex >= previewCount - 1}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretRight size={12} weight="bold" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <p className="text-sm text-(--color-muted)">
                {previewRecipient ? "この宛先は未生成です" : "チェックした宛先を選択してください"}
              </p>
            </div>
          )}
        </>
      ) : inputMode === "direct" ? (
        <>
          <div className="flex items-center justify-between border-b border-(--color-border) bg-gray-50 px-5 py-3 dark:bg-slate-700/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MagicWand size={15} />
              メール作成
            </h2>
            {canQuoteGenerated && (
              <button
                type="button"
                onClick={onOpenGenerated}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-(--color-border) px-2 text-[11px] font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
              >
                <EnvelopeOpen size={12} />
                引用
              </button>
            )}
          </div>
          <div className="space-y-2.5 p-4">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</label>
              <input
                type="text"
                value={directSubject}
                onChange={(e) => setDirectSubject(e.target.value)}
                className="h-9 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                placeholder="{{company_name}}様へのご提案"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文</label>
              <textarea
                ref={directBodyRef}
                value={directBody}
                onChange={(e) => setDirectBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-card) p-3 font-mono text-[12px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                placeholder={"本文を入力\n\n{{company_name}} → 企業名\n{{person_name}} → 担当者名\n{{AI:指示}} → AI生成"}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {([
                ["company_name", "企業名"],
                ["person_name", "担当者名"],
                ["sender_name", "送信者名"],
                ["service_name", "サービス名"],
                ["lp_url", "LP"],
                ["booking_url", "予約URL"],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertAtCursorDirect(`{{${v}}}`)}
                  className="inline-flex h-6 cursor-pointer items-center rounded border border-(--color-border) px-1.5 text-[10px] font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => insertAtCursorDirect("{{AI:}}", 2)}
                className="inline-flex h-6 cursor-pointer items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                title="AIが企業ごとに書く部分。空なら全体になじむ文をAIが考える。: の後に指示も書ける"
              >
                <MagicWand size={10} weight="fill" />
                AI
              </button>
            </div>
          </div>
          {previewRecipient && hasContent && (
            <div className="border-t border-(--color-border) bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between px-4 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">
                  差し込みプレビュー
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] tabular-nums text-(--color-muted)">
                    {clampedPreviewIndex + 1}/{previewCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                    disabled={clampedPreviewIndex === 0}
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-(--color-muted) hover:text-(--color-primary) disabled:opacity-30"
                  >
                    <CaretLeft size={11} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.min(previewCount - 1, i + 1))}
                    disabled={clampedPreviewIndex >= previewCount - 1}
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-(--color-muted) hover:text-(--color-primary) disabled:opacity-30"
                  >
                    <CaretRight size={11} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto px-4 pb-3">
                <p className="text-[11px] font-semibold">{buildEmail(previewRecipient).subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-[1.7] text-(--color-muted)">
                  {buildEmail(previewRecipient).body}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Eye size={15} />
              送信プレビュー
            </h2>
            {previewRecipient && (
              <span className="inline-flex items-center gap-1 rounded-md bg-(--color-success-light) px-2 py-0.5 text-[10px] font-semibold text-(--color-success)">
                <Check size={10} weight="bold" />
                選択中
              </span>
            )}
          </div>

          {previewRecipient && hasContent ? (
            <>
              <div className="space-y-3.5 p-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">宛先</p>
                  <p className="mt-0.5 text-[13px]">{previewRecipient.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</p>
                  <p className="mt-0.5 text-sm font-semibold">{buildEmail(previewRecipient).subject}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文（下書き）</p>
                  <div className="mt-1 max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--color-border) bg-gray-50 p-3.5 text-[13px] leading-[1.9] dark:bg-slate-800">
                    {buildEmail(previewRecipient).body.replace(/\{\{AI:[\s\S]*?\}\}/g, "【AIが会社ごとに書く部分】")}
                  </div>
                  <p className="mt-1.5 text-[11px] text-(--color-muted)">
                    「選択した{checkedCount}件を生成」を押すと、【AIが書く部分】に会社ごとの文章が入ります。
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-2.5 dark:bg-slate-700/50">
                <span className="text-[11px] tabular-nums text-(--color-muted)">
                  {clampedPreviewIndex + 1} / {previewCount} 件目
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                    disabled={clampedPreviewIndex === 0}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretLeft size={12} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.min(previewCount - 1, i + 1))}
                    disabled={clampedPreviewIndex >= previewCount - 1}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretRight size={12} weight="bold" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <p className="text-sm text-(--color-muted)">
                {!hasContent
                  ? "テンプレートを選択してください"
                  : "チェックした宛先のプレビューが表示されます"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
