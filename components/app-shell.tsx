"use client";

import { Fragment, useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  AddressBook,
  ClockCounterClockwise,
  GearSix,
  House,
  List,
  Moon,
  PaperPlaneRight,
  PaperPlaneTilt,
  Sun,
  X,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import logoIcon from "@/app/icon.png";
import { useTheme } from "@/lib/theme-context";
import { Modal } from "@/components/modal";
import { ServiceSwitcher } from "@/components/service-switcher";
import { TestModeBadge } from "@/components/test-mode-badge";

/**
 * アプリ共通のシェル（上部バー＋左サイドバー＋モバイルのドロワー）。
 *
 * サイドバーは3状態:
 *  - 1280px以上: 240px 展開（アイコン＋ラベル）
 *  - 768〜1279px: 64px のアイコンレール（ラベルはツールチップ）
 *  - 768px未満: 隠す。上部バーのハンバーガーから左ドロワーで出す
 *
 * 並びは使う頻度順（IA-DESIGN §1）。左サイドバーだけがナビの本体で、
 * モバイルの下部固定バーは置かない（ページ固有の送信バーと場所を奪い合うため）。
 */

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** href 以外にも現在地とみなすパス接頭辞（例: /prospect/* は「履歴」） */
  extraPrefixes?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", Icon: House },
  { href: "/bulk-send", label: "一括送信", Icon: PaperPlaneRight },
  { href: "/generate", label: "メール作成", Icon: PaperPlaneTilt },
  { href: "/collection", label: "宛先集め", Icon: AddressBook },
  { href: "/history", label: "履歴", Icon: ClockCounterClockwise, extraPrefixes: ["/prospect"] },
  { href: "/settings", label: "設定", Icon: GearSix },
];

/** 毎日使うものと、たまにしか触らないものの境目 */
const DIVIDER_BEFORE = "/settings";

/**
 * 一致した接頭辞の長さ。索引ルート（/settings）が子ルート（/settings/templates）を
 * 誤って拾わないよう、TabNav と同じ「最長一致」で現在地を決める。
 */
function matchLength(pathname: string, prefix: string): number {
  if (prefix === "/") return pathname === "/" ? 1 : 0;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return prefix.length;
  return 0;
}

function findActiveHref(pathname: string): string {
  let bestHref = "";
  let bestLength = 0;
  for (const item of NAV_ITEMS) {
    for (const prefix of [item.href, ...(item.extraPrefixes ?? [])]) {
      const length = matchLength(pathname, prefix);
      if (length > bestLength) {
        bestLength = length;
        bestHref = item.href;
      }
    }
  }
  return bestHref;
}

const ITEM_BASE =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-(--color-primary)";

function itemClass(active: boolean) {
  return `${ITEM_BASE} ${
    active
      ? "bg-(--color-primary-light) font-semibold text-(--color-primary)"
      : "font-medium text-(--color-muted) hover:bg-(--color-card-hover) hover:text-(--color-foreground)"
  }`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { resolved, setTheme } = useTheme();

  // 画面が変わったらドロワーは閉じる（開いたまま次の画面に残らないように）
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // ログイン画面はまだ何も操作できないのでシェルを出さない
  if (pathname === "/login") {
    return <main className="px-4 py-4 md:px-6 md:py-6">{children}</main>;
  }

  const activeHref = findActiveHref(pathname);

  return (
    <>
      <header className="border-b border-(--color-border) bg-(--color-card)">
        {/* 上部バー（56px）。サイドバーより上に描いて左上のロゴを隠さない */}
        <div className="relative z-30 flex h-14 items-center gap-2 bg-(--color-card) px-3 md:px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={drawerOpen}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-foreground) focus-visible:ring-2 focus-visible:ring-(--color-primary) md:hidden"
          >
            <List size={20} />
          </button>

          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-(--color-primary)"
          >
            <Image src={logoIcon} alt="" width={26} height={26} className="rounded-sm" />
            <span className="text-lg font-semibold tracking-tight">SalesMail</span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <TestModeBadge />
            <ServiceSwitcher />
            <button
              type="button"
              onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-foreground) focus-visible:ring-2 focus-visible:ring-(--color-primary)"
              aria-label="テーマ切替"
            >
              {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* 左サイドバー: 1280px以上で展開、768〜1279pxはアイコンレール、768px未満は非表示 */}
        <nav
          aria-label="メイン"
          className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col gap-1 overflow-y-auto border-r border-(--color-border) bg-(--color-card) px-2 pb-4 pt-16 md:flex xl:w-60"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.href === activeHref;
            return (
              <Fragment key={item.href}>
                {item.href === DIVIDER_BEFORE && (
                  <span aria-hidden="true" className="my-1.5 h-px shrink-0 bg-(--color-border)" />
                )}
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`${itemClass(active)} justify-center xl:justify-start`}
                >
                  <item.Icon size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
                  <span className="sr-only xl:not-sr-only">{item.label}</span>
                </Link>
              </Fragment>
            );
          })}
        </nav>
      </header>

      {/* モバイルのドロワー（ESC・外側クリックで閉じ、開いたら中へフォーカス） */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="メインメニュー"
        overlayClassName="fixed inset-0 z-50 flex bg-black/40 md:hidden"
      >
        <div className="flex h-full w-64 max-w-[80vw] flex-col gap-1 border-r border-(--color-border) bg-(--color-card) p-2">
          <div className="mb-1 flex h-12 items-center justify-between pl-2">
            <span className="text-base font-semibold tracking-tight">SalesMail</span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="メニューを閉じる"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) hover:text-(--color-foreground) focus-visible:ring-2 focus-visible:ring-(--color-primary)"
            >
              <X size={18} />
            </button>
          </div>
          <nav aria-label="メイン" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={itemClass(active)}
                >
                  <item.Icon size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </Modal>

      <div className="md:pl-16 xl:pl-60">
        <main className="mx-auto w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </>
  );
}
