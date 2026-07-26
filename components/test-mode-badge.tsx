"use client";

import { useEffect, useState } from "react";
import { Flask } from "@phosphor-icons/react";

/**
 * 上部バーの常時表示バッジ「テストモード：全メールは自分宛てに届きます」。
 *
 * どの画面にいても「いまは本番送信ではない」と分かるようにするための保険。
 * 各ページ内の既存テストモード表示は残す（二重表示は許容・IA-DESIGN §3.2）。
 *
 * 取得に失敗したらバッジを出さないだけ。ナビゲーションは絶対に止めない。
 */
export function TestModeBadge() {
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.test_mode === "true") setTestMode(true);
      })
      .catch(() => {
        // 取れなければ出さないだけ
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!testMode) return null;

  return (
    <span className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-(--color-danger)/40 bg-(--color-danger-light) px-2.5 text-xs font-semibold text-(--color-danger-text)">
      <Flask size={14} weight="fill" className="shrink-0" />
      <span className="sr-only md:not-sr-only">テストモード：全メールは自分宛てに届きます</span>
    </span>
  );
}
