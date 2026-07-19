"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockSimple, SpinnerGap } from "@phosphor-icons/react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

/** オープンリダイレクト防止: 同一サイト内の絶対パスだけを許可する */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

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
        const data = await res.json();
        setError(data.error || "ログインに失敗しました");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] rounded-2xl border border-(--color-border) bg-(--color-card) p-7"
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-(--color-primary-light) text-(--color-primary)">
            <LockSimple size={20} weight="bold" />
          </span>
          <h1 className="text-lg font-bold tracking-tight">SalesMail</h1>
          <p className="text-[13px] text-(--color-muted)">続けるにはパスワードを入力してください</p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="パスワード"
          className="h-11 w-full rounded-lg border border-(--color-border) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
        />

        {error && (
          <p className="mt-2.5 rounded-lg bg-(--color-danger-light) px-3 py-2 text-[13px] text-(--color-danger)">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <SpinnerGap size={16} className="animate-spin" />}
          {submitting ? "確認中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
