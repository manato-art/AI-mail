"use client";

import type { ComponentType, ReactNode } from "react";
import type { IconProps } from "@phosphor-icons/react";

/**
 * 画面をまたいで見た目を揃えるための最小の部品置き場。
 *
 * 色は必ず既存のテーマ変数（--color-*）を使う。ハードコードした色を書くと
 * ダークテーマ・アクセントカラー切替のときだけ崩れる（globals.css が正本）。
 *
 * ボタン・入力欄は 44px 以上（min-h-11 / h-11）。フォーカスリングは必ず見える。
 * アニメーションは prefers-reduced-motion を尊重する（motion-reduce:transition-none）。
 */

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-background)";

/** カードの外枠。境界線＋角丸12px＋カード背景 */
export const CARD = "rounded-xl border border-(--color-border) bg-(--color-card)";

export const BTN_BASE =
  `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

/** 進む操作（保存・送信・生成）。1画面につき原則1つだけ目立たせる */
export const BTN_PRIMARY = `${BTN_BASE} bg-(--color-primary) text-white hover:bg-(--color-primary-hover)`;

/** 補助操作。枠線だけの控えめなボタン */
export const BTN_SECONDARY =
  `${BTN_BASE} border border-(--color-border) text-(--color-foreground) hover:border-(--color-primary) hover:bg-(--color-card-hover)`;

/** 取り消し・削除・危険。青と同じ見た目にしない */
export const BTN_DANGER =
  `${BTN_BASE} border border-(--color-danger)/40 text-(--color-danger-text) hover:bg-(--color-danger-light)`;

/**
 * 元に戻せない操作（履歴全削除など）。
 * 赤地＋白文字はダークテーマでも文字が読める（赤文字＋淡赤地は暗い側でコントラストが落ちる）。
 */
export const BTN_DANGER_SOLID =
  `${BTN_BASE} bg-(--color-danger) text-white hover:bg-(--color-danger-hover)`;

export const ICON_BTN =
  `flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-foreground) disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

export const ICON_BTN_DANGER =
  `flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-danger-light) hover:text-(--color-danger-text) disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

export const FIELD =
  "h-11 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25";

export const SELECT = `${FIELD} appearance-none pr-9`;

export const TEXTAREA =
  "w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-2.5 text-sm leading-relaxed text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25";

export const LABEL = "mb-1.5 block text-[13px] font-medium text-(--color-foreground)";

export const HELP = "mt-1.5 text-[13px] leading-relaxed text-(--color-muted)";

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  Icon?: ComponentType<IconProps>;
  /** 見出し右側に置く小さな操作（件数バッジ・追加ボタン等） */
  action?: ReactNode;
  /** danger = 取り返しのつかない操作の隔離枠（赤） */
  tone?: "default" | "danger";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * 見出し（＋説明）と本文をひとまとまりに見せる箱。
 * 設定画面はこの箱を単位に「1カード＝1つの決めごと」で並べる。
 */
export function Card({
  title,
  description,
  Icon,
  action,
  tone = "default",
  className = "",
  bodyClassName = "p-5",
  children,
}: CardProps) {
  const danger = tone === "danger";
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-(--color-card) ${
        danger ? "border-(--color-danger)/40" : "border-(--color-border)"
      } ${className}`}
    >
      {(title || action) && (
        // 見出しと action（検索欄など）は狭い画面では折り返して2段にする。
        // 1行に押し込むと action 側が shrink-0 のぶん見出しが潰れ、
        // 日本語が1文字ずつ縦積みになる（M7: /settings/suppressions 384px）。
        <div
          className={`flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 ${
            danger ? "border-(--color-danger)/25 bg-(--color-danger-light)" : "border-(--color-border)"
          }`}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                  danger
                    ? "bg-(--color-danger)/15 text-(--color-danger-text)"
                    : "bg-(--color-primary-light) text-(--color-primary-text)"
                }`}
              >
                <Icon size={15} weight="bold" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2
                  className={`text-[15px] font-semibold text-balance ${
                    danger ? "text-(--color-danger-text)" : "text-(--color-foreground)"
                  }`}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-[13px] leading-relaxed text-(--color-muted)">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** 件数などを示す小さな丸バッジ */
export function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-(--color-primary-light) px-2 text-[13px] font-semibold text-(--color-primary-text)">
      {count}
    </span>
  );
}
