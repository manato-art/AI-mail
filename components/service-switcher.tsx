"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, Check, Tag } from "@phosphor-icons/react";
import { useActiveService } from "./service-context";

/**
 * 上部バーの商材スイッチャー「商材: すべて ▾」。
 *
 * 変えるのは各画面の初期表示（フィルタ・selectの初期値）だけで、
 * 送信内容やAPIの中身は一切変えない（IA-DESIGN §3.4）。
 *
 * ネイティブの select は使わない。既存テストが「画面内で最初の select /
 * combobox」を掴んでいるため、シェルが select を増やすと各画面の
 * 選択操作を横取りしてしまう。
 */

interface Option {
  /** null = すべての商材 */
  id: number | null;
  label: string;
}

export function ServiceSwitcher() {
  const { services, activeServiceId, setActiveServiceId } = useActiveService();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const options: Option[] = [
    { id: null, label: "すべての商材" },
    ...services.map((s) => ({ id: s.id, label: s.name })),
  ];
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.id === activeServiceId)
  );
  const activeLabel = activeServiceId === null ? "すべて" : (options[selectedIndex]?.label ?? "すべて");

  useEffect(() => {
    if (!open) return;
    optionRefs.current[selectedIndex]?.focus();
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, selectedIndex]);

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  function choose(id: number | null) {
    setActiveServiceId(id);
    close();
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const current = optionRefs.current.findIndex((el) => el === document.activeElement);
    const index = current < 0 ? selectedIndex : current;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      optionRefs.current[Math.min(index + 1, options.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      optionRefs.current[Math.max(index - 1, 0)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      optionRefs.current[options.length - 1]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[index]?.id ?? null);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  // 商材が1件も登録されていなければ切り替える意味がないので出さない
  if (services.length === 0) return null;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        title={`商材: ${activeLabel}`}
        className="flex min-h-11 min-w-0 max-w-[38vw] cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-2.5 text-sm font-medium text-(--color-foreground) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) focus-visible:ring-2 focus-visible:ring-(--color-primary) md:max-w-[16rem]"
      >
        <Tag size={16} className="shrink-0 text-(--color-muted)" />
        <span className="truncate">
          <span className="hidden sm:inline">商材: </span>
          {activeLabel}
        </span>
        <CaretDown size={12} weight="bold" className="shrink-0 text-(--color-muted)" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="商材の切り替え"
          onKeyDown={onListKeyDown}
          className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-80 w-64 max-w-[80vw] overflow-y-auto rounded-xl border border-(--color-border) bg-(--color-card) p-1 shadow-lg"
        >
          {options.map((option, i) => {
            const selected = option.id === activeServiceId;
            return (
              <li
                key={option.id ?? "all"}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onClick={() => choose(option.id)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
                  selected
                    ? "bg-(--color-primary-light) font-semibold text-(--color-primary-text)"
                    : "text-(--color-foreground) hover:bg-(--color-card-hover)"
                }`}
              >
                <Check size={14} weight="bold" className={selected ? "shrink-0" : "shrink-0 opacity-0"} />
                <span className="truncate">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
