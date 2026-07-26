"use client";

import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";

/**
 * 「①だれに送る → ②なにを送る → ③だれから送る」の番号付きセクション。
 *
 * 折りたたんでいる間も中身は DOM に残す（hidden）。取り外すと入力途中の
 * 件名・本文・選択が消えてしまうため。
 */
interface StepSectionProps {
  /** ①②③ の番号 */
  step: number;
  title: string;
  /** 見出しの下に置く1行説明（任意） */
  hint?: string;
  open: boolean;
  /** 省略すると常時展開（開閉ボタンを出さない） */
  onToggle?: () => void;
  /** 見出し行の右に置く操作（②の入力方法の切替など。折りたたみ中も押せる） */
  headerExtra?: ReactNode;
  id: string;
  /** 中身の余白。表をそのまま置くときは "" で余白なしにする */
  bodyClassName?: string;
  children: ReactNode;
}

export function StepSection({
  step,
  title,
  hint,
  open,
  onToggle,
  headerExtra,
  id,
  bodyClassName = "p-4 md:p-5",
  children,
}: StepSectionProps) {
  const heading = (
    <>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-primary-light) text-[13px] font-bold text-(--color-primary-text)"
      >
        {step}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-balance text-(--color-foreground)">{title}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-relaxed text-(--color-muted)">{hint}</span>}
      </span>
    </>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:px-5">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={id}
            className="flex min-h-11 min-w-0 flex-1 basis-[15rem] cursor-pointer items-center gap-3 rounded-lg text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
          >
            {heading}
            <CaretDown
              size={16}
              weight="bold"
              className={`ml-auto shrink-0 text-(--color-muted) transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            />
          </button>
        ) : (
          <div className="flex min-h-11 min-w-0 flex-1 basis-[15rem] items-center gap-3">{heading}</div>
        )}
        {headerExtra && <div className="shrink-0">{headerExtra}</div>}
      </div>
      <div id={id} className={open ? `border-t border-(--color-border) ${bodyClassName}` : "hidden"}>
        {children}
      </div>
    </section>
  );
}
