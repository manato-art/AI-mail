"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  ChartBar,
  PaperPlaneTilt,
  Clock,
  PaperPlaneRight,
  GearSix,
  Moon,
  Sun,
  DotsThreeOutline,
  Stack,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import logoIcon from "./icon.png";
import { useTheme } from "@/lib/theme-context";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** 現在地の判定に使う接頭辞。href が配下の1ページを指す場合に指定する */
  activePrefix?: string;
}

/**
 * 作業の順番（集める → 書く → 送る → 見る）に並べる。
 * 左から右に進めば1周するので、並び自体が使い方の説明になる。
 *
 * 「設定」は /settings/templates を指す。設定の中でいちばん触るのがテンプレートで、
 * 全般（Gmail接続など）は一度設定したらほとんど開かないため。
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ダッシュボード", Icon: ChartBar },
  { href: "/collection", label: "企業リスト", Icon: Stack },
  { href: "/generate", label: "生成", Icon: PaperPlaneTilt },
  { href: "/bulk-send", label: "一括送信", Icon: PaperPlaneRight },
  { href: "/history", label: "履歴", Icon: Clock },
  { href: "/settings/templates", label: "設定", Icon: GearSix, activePrefix: "/settings" },
];

/** 毎日使うものと、たまにしか触らないものの境目 */
const DIVIDER_BEFORE = "/settings/templates";

/**
 * スマホの下タブに出す4つ。5つ目は「その他」に使うため、ここは4つまで。
 *
 * 「生成」を外しているのは、URLを貼って長い本文を読んで直す作業で、
 * スマホで完結させにくいため。逆に企業リストと履歴は確認が主なのでスマホ向き。
 * 並び順は上の NAV_ITEMS に従う。
 */
const MOBILE_TAB_HREFS = new Set(["/", "/collection", "/bulk-send", "/history"]);

const BOTTOM_TAB_ITEMS = NAV_ITEMS.filter((item) => MOBILE_TAB_HREFS.has(item.href));
const MORE_SHEET_ITEMS = NAV_ITEMS.filter((item) => !MOBILE_TAB_HREFS.has(item.href));

export function NavHeader() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { resolved, setTheme } = useTheme();

  // ログイン画面ではナビを出さない（まだ何も操作できないため）
  if (pathname === "/login") return null;

  function isActive(item: NavItem) {
    const prefix = item.activePrefix ?? item.href;
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }

  function toggleTheme() {
    setTheme(resolved === "dark" ? "light" : "dark");
  }

  const moreSheetHasActive = MORE_SHEET_ITEMS.some(isActive);

  return (
    <>
      <header className="border-b border-(--color-border) bg-(--color-card)">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <Link href="/" className="group mr-6 flex shrink-0 items-center gap-2.5">
            <Image src={logoIcon} alt="SalesMail" width={26} height={26} className="rounded-sm" />
            <span className="text-lg font-semibold tracking-tight">SalesMail</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="メイン">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <div key={item.href} className="flex items-center">
                  {item.href === DIVIDER_BEFORE && (
                    <span
                      aria-hidden="true"
                      className="mx-2.5 h-5 w-px bg-(--color-border)"
                    />
                  )}
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
                      active
                        ? "bg-(--color-primary-light) font-semibold text-(--color-primary)"
                        : "font-medium text-(--color-muted) hover:bg-(--color-card-hover) hover:text-(--color-foreground)"
                    }`}
                  >
                    <item.Icon size={16} weight={active ? "fill" : "regular"} />
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="cursor-pointer rounded-lg p-2 text-(--color-muted) transition-colors hover:bg-(--color-card-hover) hover:text-(--color-foreground)"
              aria-label="テーマ切替"
            >
              {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-(--color-border) bg-(--color-card) md:hidden"
        aria-label="メイン"
      >
        <div className="flex h-16 items-center justify-around">
          {BOTTOM_TAB_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? "text-(--color-primary)" : "text-(--color-muted)"
                }`}
              >
                <item.Icon size={20} weight={active ? "fill" : "regular"} />
                <span className="text-[10px] leading-tight">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`flex h-full flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 transition-colors ${
              moreOpen || moreSheetHasActive ? "text-(--color-primary)" : "text-(--color-muted)"
            }`}
          >
            <DotsThreeOutline
              size={20}
              weight={moreOpen || moreSheetHasActive ? "fill" : "regular"}
            />
            <span className="text-[10px] leading-tight">その他</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-label="閉じる"
          />
          <div className="relative rounded-t-2xl border-t border-(--color-border) bg-(--color-card) px-4 pb-6 pt-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-(--color-border)" />
            {MORE_SHEET_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-(--color-primary-light) text-(--color-primary)"
                      : "text-(--color-foreground) hover:bg-(--color-card-hover)"
                  }`}
                >
                  <item.Icon size={20} weight={active ? "fill" : "regular"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
