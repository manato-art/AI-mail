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
import { Toast } from "@/components/toast";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  FIELD,
  LABEL,
  SELECT,
} from "@/components/ui-kit";

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
  /** F1: 採用ページのURL（検出できた場合） */
  recruitPageUrl: string | null;
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

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
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
        setSearchReady(next === "scrape" || settings.serper_api_key_configured === "true");
      }
      showToast(next === "scrape" ? "スクレイピングモードに切替" : "APIモードに切替");
    } catch { /* ignore */ }
  }

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
        setSearchReady(mode === "scrape" || settings.serper_api_key_configured === "true");

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
                recruitPageUrl: data.recruitPageUrl ?? null,
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
        recruitPageUrl: null,
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

  /**
   * F1: 検索結果を企業リストに保存する。
   * これまで結果はページ内の state だけで、リロードすると消えていた。
   */
  async function handleSaveToCompanies() {
    if (selectedRows.length === 0) {
      showToast("企業を選択してください");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "keyword_search",
          sourceDetail: decidedSite?.site ? `${decidedSite.site} / ${keyword.trim()}` : keyword.trim(),
          rows: selectedRows.map((r) => ({
            name: r.name,
            domain: r.domain,
            hpUrl: r.homepage,
            email: r.email,
            personName: r.personName,
            emailSourceUrl: r.homepage,
            recruitPageUrl: r.recruitPageUrl,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "保存に失敗しました");
        return;
      }
      showToast(
        `企業${data.companiesAdded}件 / 連絡先${data.contactsAdded}件を保存しました（重複は除外）`
      );
    } catch {
      showToast("保存に失敗しました");
    } finally {
      setSaving(false);
    }
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
    <div className="animate-fade-in flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-(--color-foreground)">
        キーワードから企業を探し、メールアドレス・宛名入りの宛先リストを自動で作ります
      </p>

      {/* 検索のやり方（1回だけ探す）。段は上から順に: 探し方 → 条件 → 進み具合 → 結果 → 次の行き先 */}
      <div>
        <div className="inline-flex rounded-lg border border-(--color-border) bg-(--color-card-hover) p-1">
          <button
            type="button"
            onClick={() => { if (searchMode !== "api") toggleSearchMode(); }}
            disabled={isBusy}
            aria-pressed={searchMode === "api"}
            className={`min-h-11 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
              searchMode === "api"
                ? "bg-(--color-card) text-(--color-foreground) shadow-sm"
                : "text-(--color-muted) hover:text-(--color-foreground)"
            }`}
          >
            API（高速・安定）
          </button>
          <button
            type="button"
            onClick={() => { if (searchMode !== "scrape") toggleSearchMode(); }}
            disabled={isBusy}
            aria-pressed={searchMode === "scrape"}
            className={`min-h-11 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
              searchMode === "scrape"
                ? "bg-(--color-card) text-(--color-foreground) shadow-sm"
                : "text-(--color-muted) hover:text-(--color-foreground)"
            }`}
          >
            スクレイピング（無料）
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-(--color-muted)">
          {searchMode === "api" ? (
            <>
              Serper.dev 経由で検索。登録で2,500クエリ無料。
              {!searchReady && (
                <Link href="/settings" className="ml-1 whitespace-nowrap font-medium text-(--color-primary-text) underline underline-offset-2">
                  APIキーを設定
                </Link>
              )}
            </>
          ) : (
            "DuckDuckGo をスクレイピング。APIキー不要・完全無料。大量利用時にブロックされる場合あり。"
          )}
        </p>
      </div>

      {/* Search form */}
      <div className={`${CARD} p-5`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="kw-search-keyword">
              キーワード
            </label>
            <div className="relative">
              <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
              <input
                id="kw-search-keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={isBusy}
                placeholder="例: インターン"
                className={`${FIELD} pl-10 disabled:opacity-50`}
              />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="kw-search-site">
              検索先サイト
            </label>
            <div className="relative">
              <Globe size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
              <input
                id="kw-search-site"
                type="text"
                value={siteInput}
                onChange={(e) => setSiteInput(e.target.value)}
                disabled={isBusy || aiAuto}
                placeholder="例: wantedly.com"
                className={`${FIELD} pl-10 disabled:opacity-50`}
              />
            </div>
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-(--color-foreground)">
              <input
                type="checkbox"
                checked={aiAuto}
                onChange={(e) => setAiAuto(e.target.checked)}
                disabled={isBusy}
                className="h-4 w-4 cursor-pointer accent-(--color-primary)"
              />
              AIにおまかせ（キーワードから検索先を自動判断）
            </label>
            <p className="text-[12px] leading-relaxed text-(--color-muted)">
              AIの候補: {AI_SITE_POOL.map((s) => `${s.label}（${s.genre}）`).join(" / ")} ほか、キーワードに応じて判断
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="kw-search-max">
              最大件数
            </label>
            <div className="relative w-full md:w-40">
              <select
                id="kw-search-max"
                value={maxCount}
                onChange={(e) => setMaxCount(e.target.value)}
                disabled={isBusy}
                className={`${SELECT} disabled:opacity-50`}
              >
                {MAX_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}社</option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)" size={16} weight="bold" />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              className={`${BTN_PRIMARY} btn-shine w-full`}
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
        <div className={`${CARD} animate-fade-in p-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{phaseLabel}</p>
            <div className="flex items-center gap-3">
              <span className="text-[13px] tabular-nums text-(--color-muted)">{progressPct}%</span>
              {phase === "resolving" && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) transition-colors motion-reduce:transition-none hover:border-(--color-danger) hover:text-(--color-danger-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-danger)"
                >
                  <X size={12} weight="bold" />
                  中止
                </button>
              )}
            </div>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-(--color-card-hover)">
            <div
              className="h-full rounded-full bg-(--color-primary) transition-all duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {decidedSite && (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-(--color-muted)">
              <Sparkle size={14} className="text-(--color-primary-text)" />
              AIの判断: <span className="font-semibold text-(--color-foreground)">{decidedSite.site}</span>
              {decidedSite.reason && ` — ${decidedSite.reason}`}
            </p>
          )}
        </div>
      )}

      {runError && (
        <div className="animate-fade-in flex gap-2.5 rounded-xl border border-(--color-danger) bg-(--color-danger-light) p-4 text-sm">
          <Warning className="mt-0.5 shrink-0 text-(--color-danger-text)" size={20} weight="fill" />
          <p className="leading-relaxed text-(--color-foreground)">{runError}</p>
        </div>
      )}

      {/* Results */}
      {rows.length > 0 && (
        <div className={`${CARD} animate-fade-in overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border) px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Buildings size={16} />
              検索結果
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-(--color-primary-light) px-1.5 text-[13px] font-bold text-(--color-primary-text)">
                {displayRows.length}
              </span>
              {decidedSite && !isBusy && (
                <span className="text-[12px] font-normal text-(--color-muted)">via {decidedSite.site}</span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] text-(--color-muted)">
                <input
                  type="checkbox"
                  checked={excludeSent}
                  onChange={(e) => setExcludeSent(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                />
                送信済みを除外
              </label>
              <button
                type="button"
                onClick={() => handleToggleAll(true)}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${allDisplayChecked ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary-text)" : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary-text)"}`}
              >
                <Check size={13} weight="bold" />
                全選択
              </button>
              <button
                type="button"
                onClick={() => handleToggleAll(false)}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:text-(--color-primary-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
              >
                全解除
              </button>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="divide-y divide-(--color-border) md:hidden">
            {displayRows.map((r) => {
              const sent = isSentBefore(r);
              return (
                <div key={r.id} className={`px-4 py-3 ${sent ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => handleToggleRow(r.id)}
                      aria-label={`${r.name} を選択`}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.name}</span>
                        {sent && (
                          <span className="shrink-0 rounded-full bg-(--color-card-hover) px-2 py-0.5 text-[11px] font-medium text-(--color-muted)">
                            送信済み
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] text-(--color-muted)">{r.status === "done" ? contactLabel(r) : ""}</p>
                      <div className="mt-1 text-[13px]">
                        {r.status === "pending" && <span className="text-(--color-muted)">待機中...</span>}
                        {r.status === "resolving" && (
                          <span className="flex items-center gap-1 text-(--color-muted)">
                            <SpinnerGap size={13} className="animate-spin" />
                            HP解析中...
                          </span>
                        )}
                        {r.status === "failed" && <span className="text-(--color-danger-text)">取得失敗</span>}
                        {r.status === "done" && r.email && <span className="text-(--color-primary-text)">{r.email}</span>}
                        {r.status === "done" && !r.email && r.formUrl && (
                          <span className="text-(--color-warning-text)">フォームのみ（メール送信不可）</span>
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
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-(--color-border) bg-(--color-card-hover) text-left">
                  <th className="w-[40px] px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allDisplayChecked}
                      onChange={(e) => handleToggleAll(e.target.checked)}
                      aria-label="表示中の企業をすべて選択"
                      className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                    />
                  </th>
                  <th className="min-w-[180px] px-3 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">企業名</th>
                  <th className="min-w-[130px] px-3 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">宛名</th>
                  <th className="min-w-[200px] px-3 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">メールアドレス</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">リンク</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">状態</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const sent = isSentBefore(r);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-(--color-border) transition-colors motion-reduce:transition-none last:border-0 ${r.checked ? "bg-(--color-primary-light)/40" : "hover:bg-(--color-card-hover)"} ${sent ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 text-center">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={() => handleToggleRow(r.id)}
                          aria-label={`${r.name} を選択`}
                          className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium">{r.name}</td>
                      <td className="px-3 py-3 text-(--color-muted)">
                        {r.status === "done" ? contactLabel(r) : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {r.status === "pending" && <span className="text-(--color-muted)">-</span>}
                        {r.status === "resolving" && <SpinnerGap size={14} className="animate-spin text-(--color-muted)" />}
                        {r.status === "failed" && <span className="text-(--color-danger-text)">取得失敗</span>}
                        {r.status === "done" && r.email && <span className="text-(--color-primary-text)">{r.email}</span>}
                        {r.status === "done" && !r.email && r.formUrl && (
                          <span className="inline-flex items-center gap-1 text-(--color-warning-text)">
                            <Warning size={13} weight="fill" />
                            フォームのみ（メール送信不可）
                          </span>
                        )}
                        {r.status === "done" && !r.email && !r.formUrl && (
                          <span className="text-(--color-muted)">未検出</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {r.homepage && (
                            <a
                              href={r.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="公式HP"
                              aria-label="公式HPを開く"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-primary-light) hover:text-(--color-primary-text)"
                            >
                              <Globe size={15} />
                            </a>
                          )}
                          {/* F1 採用シグナル: 採用ページがある＝いま採用に動いている可能性が高い */}
                          {r.recruitPageUrl && (
                            <a
                              href={r.recruitPageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="採用ページあり（採用活動中の可能性）"
                              className="inline-flex h-9 items-center rounded-md bg-(--color-success-light) px-2 text-[11px] font-semibold text-(--color-success-text) transition-opacity hover:opacity-80"
                            >
                              採用中
                            </a>
                          )}
                          {r.formUrl && (
                            <a
                              href={r.formUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="問い合わせフォーム"
                              aria-label="問い合わせフォームを開く"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-primary-light) hover:text-(--color-primary-text)"
                            >
                              <ArrowSquareOut size={15} />
                            </a>
                          )}
                          {r.sourceUrl && (
                            <a
                              href={r.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="出典"
                              className="inline-flex h-9 items-center rounded-md px-2 text-[11px] text-(--color-muted) transition-colors motion-reduce:transition-none hover:bg-(--color-primary-light) hover:text-(--color-primary-text)"
                            >
                              出典
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {sent ? (
                          <span className="whitespace-nowrap rounded-full bg-(--color-card-hover) px-2 py-0.5 text-[11px] font-medium text-(--color-muted)">
                            送信済み
                          </span>
                        ) : r.status === "done" ? (
                          <span className="whitespace-nowrap rounded-full bg-(--color-success-light) px-2 py-0.5 text-[11px] font-medium text-(--color-success-text)">
                            取得済み
                          </span>
                        ) : (
                          <span className="text-[11px] text-(--color-muted)">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-(--color-muted)">
            <span className="text-lg font-bold text-(--color-foreground)">{selectedRows.length}</span> / {displayRows.length} 件選択中
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveToCompanies}
              disabled={selectedRows.length === 0 || saving}
              className={BTN_SECONDARY}
              title="リロードしても消えないように企業リストへ保存します"
            >
              {saving ? <SpinnerGap size={16} className="animate-spin" /> : <Buildings size={16} />}
              {saving ? "保存中..." : "企業リストに保存"}
            </button>
            <button
              type="button"
              onClick={handleAddToBulkSend}
              disabled={selectedRows.length === 0}
              className={BTN_PRIMARY}
            >
              <PaperPlaneTilt size={16} weight="fill" />
              選択した{selectedRows.length}件を一括送信リストに追加
            </button>
          </div>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
