"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowSquareOut,
  Buildings,
  CaretDown,
  Check,
  Globe,
  MagnifyingGlass,
  PaperPlaneTilt,
  Sparkle,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { AI_SITE_POOL, MAX_COUNT_OPTIONS } from "@/lib/keyword-search-constants";
import type { Prospect } from "@/lib/types";

type Phase = "idle" | "site" | "searching" | "resolving" | "done";

type RowStatus = "pending" | "resolving" | "done" | "failed";

interface ResultRow {
  id: string;
  name: string;
  sourceUrl: string;
  status: RowStatus;
  homepage: string | null;
  domain: string | null;
  email: string | null;
  formUrl: string | null;
  personName: string | null;
  checked: boolean;
}

const RESOLVE_CONCURRENCY = 3;

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function KeywordSearchPage() {
  const router = useRouter();

  const [keyword, setKeyword] = useState("");
  const [siteInput, setSiteInput] = useState("");
  const [aiAuto, setAiAuto] = useState(true);
  const [maxCount, setMaxCount] = useState("20");

  const [searchMode, setSearchMode] = useState<"api" | "scrape">("api");
  const [searchReady, setSearchReady] = useState(true);
  const [sentDomains, setSentDomains] = useState<Set<string>>(new Set());
  const [sentNames, setSentNames] = useState<Set<string>>(new Set());
  const [excludeSent, setExcludeSent] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [decidedSite, setDecidedSite] = useState<{ site: string; reason: string } | null>(null);
  const [fallbackContact, setFallbackContact] = useState("ご担当者様");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  const cancelRef = useRef(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function toggleSearchMode() {
    const next = searchMode === "api" ? "scrape" : "api";
    setSearchMode(next);
    setSearchReady(next === "scrape" || Boolean(true));
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_mode: next }),
      });
      if (res.ok) {
        const settings = await res.json();
        setSearchReady(next === "scrape" || Boolean(settings.serper_api_key));
      }
      showToast(next === "scrape" ? "スクレイピングモードに切替" : "APIモードに切替");
    } catch { /* ignore */ }
  }

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, prospectsRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/prospects"),
        ]);
        const settings = settingsRes.ok ? await settingsRes.json() : {};
        const prospects: Prospect[] = prospectsRes.ok ? await prospectsRes.json() : [];
        if (cancelled) return;

        const mode = (settings.search_mode || "api") as "api" | "scrape";
        setSearchMode(mode);
        setSearchReady(mode === "scrape" || Boolean(settings.serper_api_key));

        const domains = new Set<string>();
        const names = new Set<string>();
        prospects.forEach((p) => {
          if (p.send_status && p.send_status !== "unsent") {
            if (p.domain) domains.add(p.domain.toLowerCase().replace(/^www\./, ""));
            if (p.company_name) names.add(p.company_name);
          }
        });
        setSentDomains(domains);
        setSentNames(names);
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const isBusy = phase === "site" || phase === "searching" || phase === "resolving";

  const canRun =
    !isBusy &&
    searchReady &&
    Boolean(keyword.trim()) &&
    (aiAuto || Boolean(siteInput.trim()));

  function isSentBefore(row: ResultRow): boolean {
    if (row.domain && sentDomains.has(row.domain.toLowerCase().replace(/^www\./, ""))) return true;
    return sentNames.has(row.name);
  }

  const displayRows = useMemo(
    () => (excludeSent ? rows.filter((r) => !isSentBefore(r)) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, excludeSent, sentDomains, sentNames]
  );

  const selectedRows = useMemo(() => displayRows.filter((r) => r.checked), [displayRows]);

  function updateRow(id: string, patch: Partial<ResultRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function resolveOne(row: ResultRow, site: string) {
    updateRow(row.id, { status: "resolving" });
    try {
      const res = await fetch("/api/keyword-search/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: row.name, sourceSite: site }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "取得失敗");

      if (!data.found) {
        updateRow(row.id, { status: "failed" });
        return;
      }

      const domain = typeof data.domain === "string" ? data.domain : null;
      const autoUncheck = domain
        ? sentDomains.has(domain.toLowerCase().replace(/^www\./, ""))
        : false;

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                status: "done",
                homepage: data.homepage ?? null,
                domain,
                email: data.email ?? null,
                formUrl: data.formUrl ?? null,
                personName: data.personName ?? null,
                checked: autoUncheck ? false : r.checked,
              }
            : r
        )
      );
    } catch {
      updateRow(row.id, { status: "failed" });
    } finally {
      setResolvedCount((c) => c + 1);
    }
  }

  async function handleRun() {
    if (!canRun) return;

    cancelRef.current = false;
    setRows([]);
    setRunError(null);
    setDecidedSite(null);
    setResolvedCount(0);

    let site = siteInput.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    try {
      if (aiAuto) {
        setPhase("site");
        const res = await fetch("/api/keyword-search/site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: keyword.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "検索元サイトの判断に失敗しました");
        site = data.site;
        setDecidedSite(data);
      }

      setPhase("searching");
      const res = await fetch("/api/keyword-search/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), site, maxCount: Number(maxCount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "企業リストの取得に失敗しました");

      setFallbackContact(data.fallbackContact || "ご担当者様");

      const companies: { name: string; sourceUrl: string }[] = data.companies ?? [];
      if (companies.length === 0) {
        setPhase("done");
        showToast("企業が見つかりませんでした");
        return;
      }

      const initialRows: ResultRow[] = companies.map((c) => ({
        id: uid(),
        name: c.name,
        sourceUrl: c.sourceUrl,
        status: "pending",
        homepage: null,
        domain: null,
        email: null,
        formUrl: null,
        personName: null,
        checked: !sentNames.has(c.name),
      }));
      setRows(initialRows);
      setPhase("resolving");

      const queue = [...initialRows];
      async function worker() {
        while (queue.length > 0 && !cancelRef.current) {
          const next = queue.shift();
          if (!next) break;
          await resolveOne(next, site);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(RESOLVE_CONCURRENCY, initialRows.length) }, () => worker())
      );

      setPhase("done");
      if (cancelRef.current) {
        showToast("処理を中止しました");
      }
    } catch (err) {
      setPhase("done");
      setRunError(err instanceof Error ? err.message : "処理に失敗しました");
    }
  }

  function handleCancel() {
    cancelRef.current = true;
  }

  function handleToggleRow(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }

  function handleToggleAll(checked: boolean) {
    const displayIds = new Set(displayRows.map((r) => r.id));
    setRows((prev) => prev.map((r) => (displayIds.has(r.id) ? { ...r, checked } : r)));
  }

  function contactLabel(row: ResultRow): string {
    return row.personName ? `${row.personName}様` : fallbackContact;
  }

  function handleAddToBulkSend() {
    if (selectedRows.length === 0) {
      showToast("企業を選択してください");
      return;
    }
    const payload = selectedRows.map((r) => ({
      company: r.name,
      person: contactLabel(r),
      email: r.email ?? "",
    }));
    try {
      sessionStorage.setItem("bulk-send-import", JSON.stringify(payload));
    } catch {
      showToast("データの受け渡しに失敗しました");
      return;
    }
    router.push("/bulk-send");
  }

  const allDisplayChecked = displayRows.length > 0 && displayRows.every((r) => r.checked);
  const progressPct =
    phase === "site" ? 10
    : phase === "searching" ? 30
    : phase === "resolving" ? 30 + Math.round((resolvedCount / Math.max(rows.length, 1)) * 65)
    : phase === "done" ? 100
    : 0;

  const phaseLabel =
    phase === "site" ? "AIが検索元サイトを判断中..."
    : phase === "searching" ? "企業を検索中..."
    : phase === "resolving" ? `各企業のHPを解析中... ${resolvedCount} / ${rows.length}`
    : "";

  return (
    <div className="animate-fade-in pb-20">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">キーワード検索</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          キーワードから企業を探し、メールアドレス・宛名入りの送信先リストを自動で作ります
        </p>
      </div>

      {/* Search mode toggle */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => { if (searchMode !== "api") toggleSearchMode(); }}
          disabled={isBusy}
          className={`cursor-pointer rounded-xl border-2 p-4 text-left transition-all disabled:opacity-40 ${
            searchMode === "api"
              ? "border-(--color-primary) bg-(--color-primary-light)"
              : "border-(--color-border) hover:border-(--color-primary)/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${searchMode === "api" ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
            <span className="text-sm font-semibold">API モード</span>
          </div>
          <p className="mt-1.5 text-xs text-(--color-muted)">
            Serper.dev 経由で高速・安定検索。登録で2,500クエリ無料。
            {searchMode === "api" && !searchReady && (
              <Link href="/settings" className="ml-1 font-medium text-(--color-primary) underline underline-offset-2">
                APIキーを設定
              </Link>
            )}
          </p>
        </button>
        <button
          type="button"
          onClick={() => { if (searchMode !== "scrape") toggleSearchMode(); }}
          disabled={isBusy}
          className={`cursor-pointer rounded-xl border-2 p-4 text-left transition-all disabled:opacity-40 ${
            searchMode === "scrape"
              ? "border-(--color-primary) bg-(--color-primary-light)"
              : "border-(--color-border) hover:border-(--color-primary)/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${searchMode === "scrape" ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"}`} />
            <span className="text-sm font-semibold">スクレイピング</span>
          </div>
          <p className="mt-1.5 text-xs text-(--color-muted)">
            DuckDuckGo をスクレイピング。APIキー不要・完全無料。大量利用時にブロックされる場合あり。
          </p>
        </button>
      </div>

      {/* Search form */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-card) p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              キーワード
            </label>
            <div className="relative">
              <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={isBusy}
                placeholder="例: インターン"
                className="h-11 w-full rounded-lg border border-(--color-border) pl-10 pr-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              検索先サイト
            </label>
            <div className="relative">
              <Globe size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={siteInput}
                onChange={(e) => setSiteInput(e.target.value)}
                disabled={isBusy || aiAuto}
                placeholder="例: wantedly.com"
                className="h-11 w-full rounded-lg border border-(--color-border) pl-10 pr-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
              />
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={aiAuto}
                onChange={(e) => setAiAuto(e.target.checked)}
                disabled={isBusy}
                className="h-4 w-4 cursor-pointer accent-(--color-primary)"
              />
              AIにおまかせ（キーワードから検索先を自動判断）
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-(--color-muted)">
              AIの候補: {AI_SITE_POOL.map((s) => `${s.label}（${s.genre}）`).join(" / ")} ほか、キーワードに応じて判断
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              最大件数
            </label>
            <div className="relative w-full md:w-40">
              <select
                value={maxCount}
                onChange={(e) => setMaxCount(e.target.value)}
                disabled={isBusy}
                className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50 transition-shadow"
              >
                {MAX_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}社</option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={16} weight="bold" color="#9ca3af" />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-all hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? (
                <>
                  <SpinnerGap size={18} className="animate-spin" />
                  検索中...
                </>
              ) : (
                <>
                  <MagnifyingGlass size={18} weight="bold" />
                  検索開始
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      {isBusy && (
        <div className="mt-5 rounded-xl border border-(--color-border) bg-(--color-card) p-5 animate-fade-in">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{phaseLabel}</p>
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-(--color-muted)">{progressPct}%</span>
              {phase === "resolving" && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-(--color-border) px-2.5 text-[11px] font-medium text-(--color-muted) transition-colors hover:border-(--color-danger) hover:text-(--color-danger)"
                >
                  <X size={11} weight="bold" />
                  中止
                </button>
              )}
            </div>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-(--color-primary) transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {decidedSite && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-(--color-muted)">
              <Sparkle size={13} className="text-(--color-primary)" />
              AIの判断: <span className="font-semibold text-(--color-foreground)">{decidedSite.site}</span>
              {decidedSite.reason && ` — ${decidedSite.reason}`}
            </p>
          )}
        </div>
      )}

      {runError && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-red-200 bg-(--color-danger-light) p-4 text-sm animate-fade-in dark:border-red-800">
          <Warning className="mt-0.5 shrink-0" size={20} weight="fill" style={{ color: "var(--color-danger)" }} />
          <p className="text-gray-700 dark:text-gray-300">{runError}</p>
        </div>
      )}

      {/* Results */}
      {rows.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card) animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border) px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Buildings size={15} />
              検索結果
              <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-(--color-primary-light) px-1.5 text-[11px] font-bold text-(--color-primary)">
                {displayRows.length}
              </span>
              {decidedSite && !isBusy && (
                <span className="text-[11px] font-normal text-(--color-muted)">via {decidedSite.site}</span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-(--color-muted)">
                <input
                  type="checkbox"
                  checked={excludeSent}
                  onChange={(e) => setExcludeSent(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-(--color-primary)"
                />
                送信済みを除外
              </label>
              <button
                type="button"
                onClick={() => handleToggleAll(true)}
                className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-3 text-xs font-medium transition-colors ${allDisplayChecked ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)" : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"}`}
              >
                <Check size={12} weight="bold" />
                全選択
              </button>
              <button
                type="button"
                onClick={() => handleToggleAll(false)}
                className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-(--color-border) px-3 text-xs font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
              >
                全解除
              </button>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-(--color-border)">
            {displayRows.map((r) => {
              const sent = isSentBefore(r);
              return (
                <div key={r.id} className={`px-4 py-3 ${sent ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => handleToggleRow(r.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.name}</span>
                        {sent && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                            送信済み
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-(--color-muted)">{r.status === "done" ? contactLabel(r) : ""}</p>
                      <div className="mt-1 text-xs">
                        {r.status === "pending" && <span className="text-(--color-muted)">待機中...</span>}
                        {r.status === "resolving" && (
                          <span className="flex items-center gap-1 text-(--color-muted)">
                            <SpinnerGap size={12} className="animate-spin" />
                            HP解析中...
                          </span>
                        )}
                        {r.status === "failed" && <span className="text-(--color-danger)">取得失敗</span>}
                        {r.status === "done" && r.email && <span className="text-(--color-primary)">{r.email}</span>}
                        {r.status === "done" && !r.email && r.formUrl && (
                          <span className="text-(--color-warning)">フォームのみ（メール送信不可）</span>
                        )}
                        {r.status === "done" && !r.email && !r.formUrl && (
                          <span className="text-(--color-muted)">メール未検出</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-(--color-border) bg-gray-50 text-left dark:bg-slate-700/50">
                  <th className="w-[40px] px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allDisplayChecked}
                      onChange={(e) => handleToggleAll(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                    />
                  </th>
                  <th className="min-w-[180px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">企業名</th>
                  <th className="min-w-[130px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">宛名</th>
                  <th className="min-w-[200px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">メールアドレス</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">リンク</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">状態</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const sent = isSentBefore(r);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-(--color-border) last:border-0 transition-colors ${r.checked ? "bg-(--color-primary-light)/30" : "hover:bg-(--color-card-hover)"} ${sent ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 text-center">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={() => handleToggleRow(r.id)}
                          className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                        {r.status === "done" ? contactLabel(r) : "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.status === "pending" && <span className="text-(--color-muted)">-</span>}
                        {r.status === "resolving" && <SpinnerGap size={14} className="animate-spin text-(--color-muted)" />}
                        {r.status === "failed" && <span className="text-(--color-danger)">取得失敗</span>}
                        {r.status === "done" && r.email && <span className="text-(--color-primary)">{r.email}</span>}
                        {r.status === "done" && !r.email && r.formUrl && (
                          <span className="inline-flex items-center gap-1 text-(--color-warning)">
                            <Warning size={12} weight="fill" />
                            フォームのみ（メール送信不可）
                          </span>
                        )}
                        {r.status === "done" && !r.email && !r.formUrl && (
                          <span className="text-(--color-muted)">未検出</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {r.homepage && (
                            <a
                              href={r.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="公式HP"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-primary-light) hover:text-(--color-primary)"
                            >
                              <Globe size={14} />
                            </a>
                          )}
                          {r.formUrl && (
                            <a
                              href={r.formUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="問い合わせフォーム"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-primary-light) hover:text-(--color-primary)"
                            >
                              <ArrowSquareOut size={14} />
                            </a>
                          )}
                          {r.sourceUrl && (
                            <a
                              href={r.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="出典"
                              className="inline-flex h-7 items-center rounded-md px-1.5 text-[10px] text-(--color-muted) transition-colors hover:bg-(--color-primary-light) hover:text-(--color-primary)"
                            >
                              出典
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {sent ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                            送信済み
                          </span>
                        ) : r.status === "done" ? (
                          <span className="rounded-full bg-(--color-success-light) px-2 py-0.5 text-[10px] font-medium text-(--color-success)">
                            取得済み
                          </span>
                        ) : (
                          <span className="text-[10px] text-(--color-muted)">
                            {r.status === "failed" ? "-" : "処理中"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer action */}
      {rows.length > 0 && phase === "done" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-(--color-muted)">
            <span className="text-lg font-bold text-(--color-foreground)">{selectedRows.length}</span> / {displayRows.length} 件選択中
          </p>
          <button
            type="button"
            onClick={handleAddToBulkSend}
            disabled={selectedRows.length === 0}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PaperPlaneTilt size={16} weight="fill" />
            選択した{selectedRows.length}件を一括送信リストに追加
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg animate-fade-in md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
