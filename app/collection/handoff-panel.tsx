"use client";

import { useRef, useState } from "react";
import { Card, BTN_SECONDARY } from "@/components/ui-kit";
import { Storefront, SpinnerGap } from "@phosphor-icons/react";

/**
 * 店パック取込（かってにHP・継ぎ目②）。
 * 店舗LP側（ローカル）の build-handoff.mjs が出した JSON を、認証の内側で本番へ反映する。
 * ここを通すと、その店の分析は「LP側の正データ」になり、自動調査は二度と触らない。
 */
interface ItemResult {
  ok: boolean;
  outcome: string;
  detail: string;
}

const OUTCOME_LABEL: Record<string, string> = {
  imported: "取込",
  suppressed: "抑止登録（営業お断り）",
  invalid: "不正",
  conflict: "競合",
};

export function HandoffPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ItemResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const packs = Array.isArray(parsed) ? parsed : [parsed];
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        setError(data.error ?? `取込に失敗しました (HTTP ${res.status})`);
        return;
      }
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof SyntaxError ? "JSONとして読めませんでした" : "取込に失敗しました（通信エラー）");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const failed = (results ?? []).filter((r) => !r.ok);

  return (
    <Card
      title="店パック取込（かってにHP）"
      description="店舗LP側で作った handoff/<店>.json を読み込みます。取り込んだ店の分析はLP側が正になり、自動調査は上書きしません。"
      Icon={Storefront}
      bodyClassName="p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <SpinnerGap size={16} className="animate-spin" /> : null}
          {busy ? "取込中..." : "JSONファイルを選ぶ"}
        </button>
      </div>

      {error && <p className="mt-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}

      {results && (
        <div className="mt-3 space-y-1 text-[13px]">
          {results.map((r, i) => (
            <p key={i} className={r.ok ? "text-(--color-foreground)" : "font-semibold text-red-600 dark:text-red-400"}>
              {r.ok ? "✓" : "✗"} {OUTCOME_LABEL[r.outcome] ?? r.outcome}: {r.detail}
            </p>
          ))}
          {failed.length > 0 && (
            <p className="pt-1 font-semibold text-red-600 dark:text-red-400">
              {failed.length}件が入っていません。この店には送らないでください。
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
