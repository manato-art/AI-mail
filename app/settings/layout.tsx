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
 * ナビの「設定」は /settings（全般）を指す。
 *
 * 並びは索引ページ（全般）を先頭にする（IA-DESIGN §4.7 / §8）。
 * ラベルの文字列は変えない（テスト互換・§6 に載せた変更のみ許可）。
 */
const TABS: TabItem[] = [
  { href: "/settings", label: "全般", Icon: GearSix },
  { href: "/settings/templates", label: "テンプレート", Icon: BookmarkSimple },
  { href: "/settings/services", label: "サービス", Icon: Briefcase },
  { href: "/settings/personas", label: "人格", Icon: UserCircle },
  { href: "/settings/suppressions", label: "送信しないリスト", Icon: Prohibit },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TabNav items={TABS} title="設定" />
      {children}
    </div>
  );
}
