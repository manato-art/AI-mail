"use client";

import {
  BookmarkSimple,
  Briefcase,
  GearSix,
  Prohibit,
  UserCircle,
} from "@phosphor-icons/react";
import { TabNav, type TabItem } from "@/components/tab-nav";

/**
 * 設定。一度決めたらあまり触らないものをまとめている。
 * ナビからは /settings/templates を指す（いちばん触る頻度が高いため）が、
 * /settings 単体も「全般」として生きている。
 */
const TABS: TabItem[] = [
  { href: "/settings/templates", label: "テンプレート", Icon: BookmarkSimple },
  { href: "/settings/services", label: "サービス", Icon: Briefcase },
  { href: "/settings/personas", label: "人格", Icon: UserCircle },
  { href: "/settings/suppressions", label: "送信しないリスト", Icon: Prohibit },
  { href: "/settings", label: "全般", Icon: GearSix },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <TabNav items={TABS} title="設定" />
      {children}
    </div>
  );
}
