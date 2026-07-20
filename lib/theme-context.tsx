"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export interface AccentColor {
  key: string;
  label: string;
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryLightDark: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { key: "blue",    label: "ブルー",     primary: "#2563eb", primaryHover: "#1d4ed8", primaryLight: "#eff6ff", primaryLightDark: "#1e3a5f" },
  { key: "indigo",  label: "インディゴ", primary: "#6366f1", primaryHover: "#4f46e5", primaryLight: "#eef2ff", primaryLightDark: "#312e81" },
  { key: "violet",  label: "バイオレット", primary: "#7c3aed", primaryHover: "#6d28d9", primaryLight: "#f5f3ff", primaryLightDark: "#3b1f6e" },
  { key: "rose",    label: "ローズ",     primary: "#e11d48", primaryHover: "#be123c", primaryLight: "#fff1f2", primaryLightDark: "#4c0519" },
  { key: "orange",  label: "オレンジ",   primary: "#ea580c", primaryHover: "#c2410c", primaryLight: "#fff7ed", primaryLightDark: "#431407" },
  { key: "emerald", label: "エメラルド", primary: "#059669", primaryHover: "#047857", primaryLight: "#ecfdf5", primaryLightDark: "#14332a" },
  { key: "teal",    label: "ティール",   primary: "#0d9488", primaryHover: "#0f766e", primaryLight: "#f0fdfa", primaryLightDark: "#134e4a" },
  { key: "slate",   label: "スレート",   primary: "#475569", primaryHover: "#334155", primaryLight: "#f1f5f9", primaryLightDark: "#1e293b" },
];

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  accent: string;
  setTheme: (t: Theme) => void;
  setAccent: (key: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  accent: "blue",
  setTheme: () => {},
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function applyAccent(key: string, resolved: "light" | "dark") {
  const color = ACCENT_COLORS.find((c) => c.key === key) ?? ACCENT_COLORS[0];
  const root = document.documentElement;
  root.style.setProperty("--primary", color.primary);
  root.style.setProperty("--primary-hover", color.primaryHover);
  root.style.setProperty("--primary-light", resolved === "dark" ? color.primaryLightDark : color.primaryLight);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [accent, setAccentState] = useState("blue");

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as Theme | null;
    const storedAccent = localStorage.getItem("accent") || "blue";
    const initial = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
    // localStorage はブラウザ専用。遅延初期化にするとサーバ描画と食い違うため、
    // マウント後に一度だけ読んで反映する（初回描画のちらつきは layout.tsx の
    // インラインスクリプトが先に data-theme を当てて防いでいる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initial);
    setAccentState(storedAccent);
    const r = initial === "system" ? getSystemTheme() : initial;
    setResolved(r);
    applyTheme(r);
    applyAccent(storedAccent, r);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function handle() {
      if (theme === "system") {
        const r = getSystemTheme();
        setResolved(r);
        applyTheme(r);
        applyAccent(accent, r);
      }
    }
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, [theme, accent]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    const r = t === "system" ? getSystemTheme() : t;
    setResolved(r);
    applyTheme(r);
    applyAccent(accent, r);
  }, [accent]);

  const setAccent = useCallback((key: string) => {
    setAccentState(key);
    localStorage.setItem("accent", key);
    applyAccent(key, resolved);
  }, [resolved]);

  return (
    <ThemeContext value={{ theme, resolved, accent, setTheme, setAccent }}>
      {children}
    </ThemeContext>
  );
}
