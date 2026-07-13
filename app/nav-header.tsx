"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  EnvelopeSimple,
  Briefcase,
  User,
  Clock,
  List,
  X,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";

const NAV_ITEMS: {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
}[] = [
  { href: "/", label: "メール作成", Icon: EnvelopeSimple },
  { href: "/services", label: "サービス", Icon: Briefcase },
  { href: "/personas", label: "人格", Icon: User },
  { href: "/history", label: "履歴", Icon: Clock },
];

export function NavHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="bg-[#0f172a]">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <EnvelopeSimple
            size={28}
            weight="duotone"
            className="text-blue-400 group-hover:text-blue-300 transition-colors"
          />
          <span className="font-semibold text-lg text-white tracking-tight">
            SalesMail
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-white/15 text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <item.Icon
                  size={16}
                  weight={active ? "fill" : "regular"}
                  className={active ? "text-blue-400" : ""}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="メニュー"
        >
          {mobileOpen ? <X size={24} /> : <List size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-white/10 px-3 py-2 pb-3 animate-fade-in">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/15 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <item.Icon
                  size={20}
                  weight={active ? "fill" : "regular"}
                  className={active ? "text-blue-400" : ""}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
