"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * アクセシブルなモーダル/シートの共通部品。
 *
 * 各画面がオーバーレイ div を自前で書くと role/aria-modal/フォーカストラップ/ESC が
 * 軒並み抜け、スクリーンリーダー・キーボードユーザーが脱出も操作もできなくなる。
 * ここに集約して以下を保証する:
 *  - role="dialog" + aria-modal="true"（背後を inert 扱いにする宣言）
 *  - aria-labelledby（見出しと関連付け）／無ければ aria-label
 *  - ESC で閉じる・背景クリックで閉じる
 *  - 開いたら内部の最初のフォーカス可能要素へフォーカス移動、Tab で内部を循環（トラップ）
 *  - 閉じたら開く前の要素へフォーカスを戻す
 *  - 開いている間は背面のスクロールをロック
 */

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** 見出し要素の id。指定すると aria-labelledby で関連付ける */
  labelledBy?: string;
  /** labelledBy が無いときのアクセシブルネーム */
  label?: string;
  children: ReactNode;
  /** オーバーレイのクラス。中央モーダル以外（下部シート等）で差し替える */
  overlayClassName?: string;
}

const DEFAULT_OVERLAY =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm";

export function Modal({
  open,
  onClose,
  labelledBy,
  label,
  children,
  overlayClassName = DEFAULT_OVERLAY,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const overlay = overlayRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 開いた直後に内部の最初のフォーカス可能要素へ
    const focusables = () =>
      Array.from(overlay?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    (focusables()[0] ?? overlay)?.focus();

    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevBodyOverflow;
      // 閉じたらトリガー要素へフォーカスを戻す
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={overlayClassName}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
