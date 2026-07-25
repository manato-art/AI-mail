"use client";

import { Check, Monitor, Moon, PaintBrush, Sun } from "@phosphor-icons/react";
import { useTheme, ACCENT_COLORS } from "@/lib/theme-context";
import { Card, LABEL } from "@/components/ui-kit";

type Theme = "light" | "dark" | "system";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "ライト", Icon: Sun },
  { value: "dark", label: "ダーク", Icon: Moon },
  { value: "system", label: "システム", Icon: Monitor },
];

/**
 * 設定>全般の「外観」カード。
 * テーマ・アクセントは API ではなくテーマコンテキスト（localStorage）で即時反映する。
 */
export function AppearanceCard() {
  const { theme, setTheme, accent, setAccent } = useTheme();

  return (
    <Card title="外観" Icon={PaintBrush} bodyClassName="space-y-5 p-5">
      <div>
        <span className={LABEL}>テーマ</span>
        <div className="grid grid-cols-3 gap-2.5">
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={active}
                className={`flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-3 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
                  active
                    ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-foreground)"
                    : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary)/40 hover:text-(--color-foreground)"
                }`}
              >
                <opt.Icon size={20} weight={active ? "fill" : "regular"} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={LABEL}>アクセントカラー</span>
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_COLORS.map((color) => {
            const active = accent === color.key;
            return (
              <button
                key={color.key}
                type="button"
                onClick={() => setAccent(color.key)}
                aria-pressed={active}
                className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 transition-colors motion-reduce:transition-none hover:bg-(--color-card-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                title={color.label}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: color.primary,
                    ...(active ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${color.primary}` } : {}),
                  }}
                >
                  {active && <Check size={13} weight="bold" className="text-white" />}
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    active ? "text-(--color-foreground)" : "text-(--color-muted)"
                  }`}
                >
                  {color.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
