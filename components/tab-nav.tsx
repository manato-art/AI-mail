"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";

export interface TabItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
}

/**
 * まとめたページの中を切り替えるタブ。
 *
 * 中身の出し分けではなくルートで分ける。こうしておくと
 * 個別のタブをブックマーク・共有でき、戻るボタンも期待どおりに動く
 * （画面内の状態で切り替えると、どちらも失われる）。
 */
export function TabNav({ items, title }: { items: TabItem[]; title: string }) {
  const pathname = usePathname();

  // 最も長く一致する href を現在地とする。索引ルート（/settings）が
  // 子ルート（/settings/templates）まで拾ってしまうのを防ぐ
  const activeHref = items.reduce<string>((best, item) => {
    const matched = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matched) return best;
    return item.href.length > best.length ? item.href : best;
  }, "");

  return (
    <div className="mb-5">
      <h1 className="mb-3 text-xl font-bold tracking-tight">{title}</h1>
      <nav
        aria-label={`${title}の切り替え`}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-(--color-border)"
      >
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 shrink-0 items-center gap-2 px-3 pb-2.5 pt-2 text-sm transition-colors ${
                active
                  ? "font-semibold text-(--color-foreground)"
                  : "font-medium text-(--color-muted) hover:text-(--color-foreground)"
              }`}
            >
              <item.Icon size={16} weight={active ? "fill" : "regular"} />
              {item.label}
              {active && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-(--color-primary)" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
