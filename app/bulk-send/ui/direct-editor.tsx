"use client";

import type { RefObject } from "react";
import { EnvelopeOpen, MagicWand } from "@phosphor-icons/react";

/**
 * 直接入力モードの下書き欄（件名・本文・差し込みチップ）。
 * 差し込みの見え方は右のプレビュー側が受け持つ。
 */
interface DirectEditorProps {
  directSubject: string;
  setDirectSubject: (value: string) => void;
  directBody: string;
  setDirectBody: (value: string) => void;
  directBodyRef: RefObject<HTMLTextAreaElement | null>;
  insertAtCursorDirect: (text: string, cursorBack?: number) => void;
  canQuoteGenerated: boolean;
  onOpenGenerated: () => void;
}

export function DirectEditor({
  directSubject,
  setDirectSubject,
  directBody,
  setDirectBody,
  directBodyRef,
  insertAtCursorDirect,
  canQuoteGenerated,
  onOpenGenerated,
}: DirectEditorProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MagicWand size={15} />
          メール作成
        </h3>
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
  );
}
