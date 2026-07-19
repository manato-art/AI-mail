"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  ChartBar,
  PaperPlaneTilt,
  Clock,
  Briefcase,
  UserCircle,
  PaperPlaneRight,
  GearSix,
  MagnifyingGlass,
  Moon,
  Sun,
  BookmarkSimple,
  DotsThreeOutline,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import logoIcon from "./icon.png";
import { useTheme } from "@/lib/theme-context";

const NAV_ITEMS: {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
}[] = [
  { href: "/", label: "ダッシュボード", Icon: ChartBar },
  { href: "/generate", label: "生成", Icon: PaperPlaneTilt },
  { href: "/bulk-send", label: "一括送信", Icon: PaperPlaneRight },
  { href: "/history", label: "履歴", Icon: Clock },
  { href: "/keyword-search", label: "キーワード検索", Icon: MagnifyingGlass },
  { href: "/templates", label: "テンプレート", Icon: BookmarkSimple },
  { href: "/services", label: "サービス", Icon: Briefcase },
  { href: "/personas", label: "人格", Icon: UserCircle },
];

const BOTTOM_TAB_ITEMS = NAV_ITEMS.slice(0, 4);

const MORE_SHEET_ITEMS = [
  ...NAV_ITEMS.slice(4),
  { href: "/settings", label: "設定", Icon: GearSix },
];

export function NavHeader() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { resolved, setTheme } = useTheme();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function toggleTheme() {
    setTheme(resolved === "dark" ? "light" : "dark");
  }

  const settingsActive = pathname.startsWith("/settings");
  const moreSheetHasActive = MORE_SHEET_ITEMS.some((item) => isActive(item.href));

  return (
    <>
      <header className="border-b border-(--color-border) bg-(--color-card)">
        <div className="flex items-center h-14 px-4 lg:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 group mr-8"
          >
            <Image
              src={logoIcon}
              alt="SalesMail"
              width={26}
              height={26}
              className="rounded-sm"
            />
            <span className="font-semibold text-lg tracking-tight">
              SalesMail
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 h-full">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-3 h-full text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? "text-(--color-primary)"
                      : "text-(--color-muted) hover:text-(--color-foreground)"
                  }`}
                >
                  <item.Icon size={16} weight={active ? "fill" : "regular"} />
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-(--color-primary) rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-(--color-muted) hover:text-(--color-foreground) hover:bg-(--color-card-hover) transition-colors cursor-pointer"
              aria-label="テーマ切替"
            >
              {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <Link
              href="/settings"
              className={`hidden md:flex p-2 rounded-lg transition-colors cursor-pointer ${
                settingsActive
                  ? "text-(--color-primary) bg-(--color-primary-light)"
                  : "text-(--color-muted) hover:text-(--color-foreground) hover:bg-(--color-card-hover)"
              }`}
              aria-label="設定"
            >
              <GearSix size={18} />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-(--color-border) bg-(--color-card)">
        <div className="flex items-center justify-around h-16">
          {BOTTOM_TAB_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors cursor-pointer ${
                  active
                    ? "text-(--color-primary)"
                    : "text-(--color-muted)"
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
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors cursor-pointer ${
              moreOpen || moreSheetHasActive
                ? "text-(--color-primary)"
                : "text-(--color-muted)"
            }`}
          >
            <DotsThreeOutline size={20} weight={moreOpen || moreSheetHasActive ? "fill" : "regular"} />
            <span className="text-[10px] leading-tight">その他</span>
          </button>
        </div>
      </nav>

      {/* "More" sheet overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 cursor-pointer"
            onClick={() => setMoreOpen(false)}
            aria-label="閉じる"
          />
          <div className="relative bg-(--color-card) rounded-t-2xl px-4 pt-4 pb-6 border-t border-(--color-border)">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-(--color-border)" />
            {MORE_SHEET_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? "text-(--color-primary) bg-(--color-primary-light)"
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
