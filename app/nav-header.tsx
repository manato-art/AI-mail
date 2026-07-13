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
  List,
  X,
  PaperPlaneRight,
  GearSix,
  Moon,
  Sun,
  BookmarkSimple,
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
  { href: "/templates", label: "テンプレート", Icon: BookmarkSimple },
  { href: "/services", label: "サービス", Icon: Briefcase },
  { href: "/personas", label: "人格", Icon: UserCircle },
];

export function NavHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolved, setTheme } = useTheme();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function toggleTheme() {
    setTheme(resolved === "dark" ? "light" : "dark");
  }

  const settingsActive = pathname.startsWith("/settings");

  return (
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
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              settingsActive
                ? "text-(--color-primary) bg-(--color-primary-light)"
                : "text-(--color-muted) hover:text-(--color-foreground) hover:bg-(--color-card-hover)"
            }`}
            aria-label="設定"
          >
            <GearSix size={18} />
          </Link>

          <div className="md:hidden ml-1">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="p-1.5 rounded-lg text-(--color-muted) hover:text-(--color-foreground) hover:bg-(--color-card-hover) transition-colors cursor-pointer"
              aria-label="メニュー"
            >
              {mobileOpen ? <X size={24} /> : <List size={24} />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-(--color-border) px-3 py-2 pb-3 animate-fade-in">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "text-(--color-primary) bg-(--color-primary-light)"
                    : "text-(--color-muted) hover:text-(--color-foreground) hover:bg-(--color-card-hover)"
                }`}
              >
                <item.Icon size={20} weight={active ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              settingsActive
                ? "text-(--color-primary) bg-(--color-primary-light)"
                : "text-(--color-muted) hover:text-(--color-foreground) hover:bg-(--color-card-hover)"
            }`}
          >
            <GearSix size={20} weight={settingsActive ? "fill" : "regular"} />
            設定
          </Link>
        </nav>
      )}
    </header>
  );
}
