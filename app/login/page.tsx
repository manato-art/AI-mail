"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LockSimple, SpinnerGap, Warning } from "@phosphor-icons/react";
import logoIcon from "@/app/icon.png";
import { BTN_PRIMARY, FIELD } from "@/components/ui-kit";

/**
 * ログイン後の戻り先を取り出す。
 *
 * useSearchParams() を使うとページ全体がサーバ描画を放棄するため、
 * JSが読めない状況で画面が真っ白になる（実際に本番で起きた）。
 * 送信時に一度読めば足りるので、その場で location から取る。
 */
function readNextPath(): string {
  if (typeof window === "undefined") return "/";
  const raw = new URLSearchParams(window.location.search).get("next");
  // オープンリダイレクト防止: 同一サイト内の絶対パスだけを許可する
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "ログインに失敗しました");
        return;
      }
      router.replace(readNextPath());
      router.refresh();
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] rounded-2xl border border-(--color-border) bg-(--color-card) p-7 shadow-sm sm:p-8"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-primary-light)">
            <Image src={logoIcon} alt="" width={32} height={32} className="rounded-md" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-balance">SalesMail</h1>
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-sm text-(--color-muted)">
              <LockSimple size={15} weight="bold" className="shrink-0" />
              続けるにはパスワードを入力してください
            </p>
          </div>
        </div>

        {/* 入力欄の中の文字（placeholder）は入力すると消えるので、読み上げ用のラベルを別に置く */}
        <label htmlFor="login-password" className="sr-only">
          パスワード
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="パスワード"
          className={FIELD}
        />

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-(--color-danger)/30 bg-(--color-danger-light) px-3 py-2.5 text-sm text-(--color-danger)"
          >
            <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <button type="submit" disabled={submitting || !password} className={`${BTN_PRIMARY} mt-5 w-full`}>
          {submitting && <SpinnerGap size={16} className="animate-spin" />}
          {submitting ? "確認中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
