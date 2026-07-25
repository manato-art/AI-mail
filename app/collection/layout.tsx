"use client";

import { Buildings, MagnifyingGlass, Stack } from "@phosphor-icons/react";
import { TabNav, type TabItem } from "@/components/tab-nav";

/**
 * 宛先集め。送る相手を増やすための入口をまとめている。
 * CSV取込は「その送信の宛先を読み込む」機能なので一括送信に残す
 * （企業リストを増やす機能ではないため、ここへ移すと一括送信で宛先を選べなくなる）。
 */
const TABS: TabItem[] = [
  { href: "/collection", label: "自動収集", Icon: Stack },
  { href: "/collection/search", label: "キーワードで探す", Icon: MagnifyingGlass },
  { href: "/collection/companies", label: "企業一覧", Icon: Buildings },
];

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TabNav items={TABS} title="宛先集め" />
      {children}
    </div>
  );
}
