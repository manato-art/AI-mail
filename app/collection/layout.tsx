"use client";

import { MagnifyingGlass, Stack } from "@phosphor-icons/react";
import { TabNav, type TabItem } from "@/components/tab-nav";

/**
 * 企業リスト。集めるための入口をまとめている。
 * CSV取込は「その送信の宛先を読み込む」機能なので一括送信に残す
 * （企業リストを増やす機能ではないため、ここへ移すと一括送信で宛先を選べなくなる）。
 */
const TABS: TabItem[] = [
  { href: "/collection", label: "在庫と自動収集", Icon: Stack },
  { href: "/collection/search", label: "キーワードで探す", Icon: MagnifyingGlass },
];

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <TabNav items={TABS} title="企業リスト" />
      {children}
    </div>
  );
}
