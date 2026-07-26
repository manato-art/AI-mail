"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CaretDown,
  Globe,
  Package,
  PaperPlaneTilt,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type {
  AnalysisResult,
  CompanyWithTag,
  Contact,
  Persona,
  Prospect,
  Service,
  Template,
} from "@/lib/types";
import { useActiveService } from "@/components/service-context";
import { BTN_PRIMARY, CARD, FIELD, LABEL, SELECT } from "@/components/ui-kit";
import { AdvancedPanel } from "./advanced-panel";
import { BatchProgress, type BatchItem } from "./batch-progress";
import { CompanyPicker } from "./company-picker";
import { DuplicateDialog, ErrorCard, LowCompatDialog, ProgressCard } from "./result-cards";
import {
  isDuplicateResponse,
  isErrorResponse,
  isLowCompatibilityResponse,
  isSuccessResponse,
  STEP_DELAY_MS,
  type GenerateResponse,
  type Status,
} from "./types";

function GeneratePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeServiceId } = useActiveService();

  const [services, setServices] = useState<Service[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [url, setUrl] = useState("");

  const [tone, setTone] = useState("balanced");
  const [length, setLength] = useState("standard");
  const [cta, setCta] = useState("online_meeting");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [fixedText, setFixedText] = useState("");
  /** 「詳しい設定」は初期は畳む（初見で見える要素を7±2に抑える・IA-DESIGN §5-6） */
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [companies, setCompanies] = useState<CompanyWithTag[]>([]);
  // 連絡先メールが1件以上ある企業のID。生成側でも「メアド有無」で絞れるようにする
  const [companyIdsWithEmail, setCompanyIdsWithEmail] = useState<Set<number>>(new Set());
  // 生成/送信状態フィルタ用。ドメイン単位の「送信済み」「生成済み」集合（正規化済み）
  const [sentDomains, setSentDomains] = useState<Set<string>>(new Set());
  const [generatedDomains, setGeneratedDomains] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"single" | "batch">("batch");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<number>>(new Set());
  const [companySearch, setCompanySearch] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const batchProgressRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duplicateProspect, setDuplicateProspect] = useState<Prospect | null>(null);
  const [lowCompatAnalysis, setLowCompatAnalysis] = useState<AnalysisResult | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [servicesRes, personasRes, templatesRes, companiesRes, genStatusRes] = await Promise.all([
          fetch("/api/services"),
          fetch("/api/personas"),
          fetch("/api/templates"),
          fetch("/api/companies"),
          fetch("/api/companies/gen-status"),
        ]);
        const servicesData: Service[] = servicesRes.ok ? await servicesRes.json() : [];
        const personasData: Persona[] = personasRes.ok ? await personasRes.json() : [];
        const templatesData: Template[] = templatesRes.ok ? await templatesRes.json() : [];
        const companiesData = companiesRes.ok
          ? await companiesRes.json()
          : { companies: [], contacts: [] };
        if (!cancelled) {
          setServices(servicesData);
          setPersonas(personasData);
          setTemplates(templatesData);
          // 調査未完了の企業は混ぜない（HPあり かつ enrichment_status==='done' のみ）
          setCompanies(
            (companiesData.companies as CompanyWithTag[]).filter((c) => c.hp_url && c.enrichment_status === "done")
          );
          const contactsData: Contact[] = Array.isArray(companiesData.contacts) ? companiesData.contacts : [];
          setCompanyIdsWithEmail(
            new Set(
              contactsData
                .filter((c) => c.company_id != null && c.email)
                .map((c) => c.company_id as number)
            )
          );
          const genStatus = genStatusRes.ok ? await genStatusRes.json().catch(() => ({})) : {};
          setSentDomains(new Set((genStatus.sentDomains as string[] | undefined) ?? []));
          setGeneratedDomains(new Set((genStatus.generatedDomains as string[] | undefined) ?? []));
        }
      } catch {
        if (!cancelled) {
          setServices([]);
          setPersonas([]);
          setTemplates([]);
          setCompanies([]);
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadingOptions) return;
    const paramUrl = searchParams.get("url");
    const paramService = searchParams.get("service");
    const paramPersona = searchParams.get("persona");
    const paramMode = searchParams.get("mode");
    if (paramUrl) setUrl(paramUrl);
    // URLクエリの service= が最優先。無いときだけ上部バーの商材を初期値に入れる
    // （どちらも実在チェックを通してからセットする）
    let serviceApplied = false;
    if (paramService && services.some((s) => String(s.id) === paramService)) {
      setSelectedServiceId(paramService);
      serviceApplied = true;
    }
    if (!serviceApplied && activeServiceId !== null && services.some((s) => s.id === activeServiceId)) {
      setSelectedServiceId(String(activeServiceId));
    }
    if (paramPersona && personas.some((p) => String(p.id) === paramPersona)) {
      setSelectedPersonaId(paramPersona);
    }
    if (paramMode === "batch") {
      setMode("batch");
      const stored = sessionStorage.getItem("batch-generate-company-ids");
      if (stored) {
        try {
          const ids: number[] = JSON.parse(stored);
          if (Array.isArray(ids) && ids.length > 0) {
            setSelectedCompanyIds(new Set(ids));
          }
        } catch { /* ignore malformed data */ }
        sessionStorage.removeItem("batch-generate-company-ids");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingOptions]);

  const isBusy =
    batchRunning || status === "crawling" || status === "analyzing" || status === "generating";

  useEffect(() => {
    if (!isBusy) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 生成中の内部リンククリックを抑止する（離脱でバッチを落とさないための安全策）
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isBusy]);

  const batchTargetUrls = companies
    .filter((c) => selectedCompanyIds.has(c.id))
    .map((c) => c.hp_url as string);

  const canSubmit =
    !isBusy &&
    !loadingOptions &&
    Boolean(selectedServiceId) &&
    Boolean(selectedPersonaId) &&
    (mode === "single" ? Boolean(url.trim()) : batchTargetUrls.length > 0);

  function resetToIdle() {
    setStatus("idle");
    setError(null);
    setDuplicateProspect(null);
    setLowCompatAnalysis(null);
  }

  async function handleGenerate(opts?: { force?: boolean; forceLow?: boolean }) {
    if (!selectedServiceId || !selectedPersonaId || !url.trim()) return;

    setError(null);
    setDuplicateProspect(null);
    setLowCompatAnalysis(null);
    setStatus("crawling");

    const t1 = setTimeout(() => setStatus("analyzing"), STEP_DELAY_MS);
    const t2 = setTimeout(() => setStatus("generating"), STEP_DELAY_MS * 2);
    timersRef.current.push(t1, t2);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: Number(selectedServiceId),
          personaId: Number(selectedPersonaId),
          url: url.trim(),
          force: opts?.force ?? false,
          forceLow: opts?.forceLow ?? false,
          tone,
          length,
          cta,
          additionalInstructions: additionalInstructions.trim() || undefined,
          fixedText: fixedText.trim() || undefined,
          templateId: selectedTemplateId ? Number(selectedTemplateId) : undefined,
        }),
      });

      clearTimeout(t1);
      clearTimeout(t2);

      const data: GenerateResponse = await res.json();

      if (!res.ok) {
        setStatus("error");
        setError(isErrorResponse(data) ? data.error : "生成に失敗しました。");
        return;
      }

      if (isDuplicateResponse(data)) {
        setDuplicateProspect(data.existingProspect);
        setStatus("duplicate");
        return;
      }

      if (isLowCompatibilityResponse(data)) {
        setLowCompatAnalysis(data.analysis);
        setStatus("low-compat");
        return;
      }

      if (isErrorResponse(data)) {
        setStatus("error");
        setError(data.error);
        return;
      }

      if (isSuccessResponse(data)) {
        setStatus("done");
        router.push(`/prospect/${data.prospect.id}`);
        return;
      }

      setStatus("error");
      setError("予期しない応答形式です。");
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setStatus("error");
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    }
  }

  async function processOneCompany(items: BatchItem[], i: number) {
    if (abortRef.current) return;

    setBatchItems((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, status: "processing" } : item))
    );

    const MAX_RETRIES = 1;
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const waitMs = attempt * 3000;
        await new Promise((r) => setTimeout(r, waitMs));
        if (abortRef.current) return;
      }

      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            serviceId: Number(selectedServiceId),
            personaId: Number(selectedPersonaId),
            url: items[i].url,
            force: true,
            forceLow: true,
            tone,
            length,
            cta,
            additionalInstructions: additionalInstructions.trim() || undefined,
            fixedText: fixedText.trim() || undefined,
            templateId: selectedTemplateId ? Number(selectedTemplateId) : undefined,
          }),
        });

        const data: GenerateResponse = await res.json();

        if (isSuccessResponse(data)) {
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "done", prospectId: data.prospect.id, companyName: data.prospect.company_name } : item
            )
          );
          return;
        } else if (isDuplicateResponse(data)) {
          // 重複・相性低は error ではなく skipped（二重生成・誤失敗表示への退行を防ぐ）
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "skipped", skipReason: "生成済み", prospectId: data.existingProspect.id, companyName: data.existingProspect.company_name } : item
            )
          );
          return;
        } else if (isLowCompatibilityResponse(data)) {
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "skipped", skipReason: "相性低" } : item
            )
          );
          return;
        } else if (isErrorResponse(data)) {
          lastError = data.error;
          const retryable = "retryable" in data && (data as { retryable?: boolean }).retryable;
          if (!retryable || attempt >= MAX_RETRIES) {
            setBatchItems((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, status: "error", error: data.error } : item
              )
            );
            return;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "error", error: "中止しました" } : item
            )
          );
          return;
        }
        lastError = err instanceof Error ? err.message : "通信エラー";
        if (attempt >= MAX_RETRIES) {
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "error", error: lastError } : item
            )
          );
          return;
        }
      }
    }

    if (lastError) {
      setBatchItems((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: "error", error: lastError } : item
        )
      );
    }
  }

  // 生成状態の集合を取り直す。生成後にバッジ・フィルタが古いまま残らないよう再取得に使う。
  const refreshGenStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/companies/gen-status");
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setSentDomains(new Set((data.sentDomains as string[] | undefined) ?? []));
      setGeneratedDomains(new Set((data.generatedDomains as string[] | undefined) ?? []));
    } catch {
      // 取得失敗時はバッジが古いままになるだけなので無視（次のマウントで復旧）
    }
  }, []);

  async function handleBatchGenerate() {
    if (!selectedServiceId || !selectedPersonaId || batchTargetUrls.length === 0) return;

    const items: BatchItem[] = batchTargetUrls.map((u) => ({ url: u, status: "waiting" as const }));
    setBatchItems(items);
    setBatchRunning(true);
    abortRef.current = false;

    setTimeout(() => {
      batchProgressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    const CONCURRENCY = 3;
    let cursor = 0;

    async function runNext(): Promise<void> {
      while (cursor < items.length && !abortRef.current) {
        const idx = cursor++;
        await processOneCompany(items, idx);
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => runNext());
    await Promise.all(workers);

    setBatchRunning(false);
    // 生成が終わったので状態集合を取り直し、バッジ・「生成状態」フィルタを最新化する
    void refreshGenStatus();
  }

  const missingServices = !loadingOptions && services.length === 0;
  const missingPersonas = !loadingOptions && personas.length === 0;

  // 上部バーで選んでいる商材の名前（企業選択の商材フィルタの初期値に使う）
  const activeServiceName =
    activeServiceId !== null
      ? services.find((s) => s.id === activeServiceId)?.name ?? null
      : null;

  const modeTabClass = (active: boolean) =>
    `min-h-11 cursor-pointer px-5 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
      active
        ? "bg-(--color-primary) text-white"
        : "bg-(--color-card) text-(--color-muted) hover:bg-(--color-card-hover) hover:text-(--color-foreground)"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">営業メールを作成</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-(--color-muted)">
            企業URLを入力すると、HPを自動分析してパーソナライズされた営業メールを生成します
          </p>
        </div>
        {/* 作り方の切替。1社ずつ＝URLを1つ、まとめて＝調査済みの企業から選ぶ */}
        <div className="flex overflow-hidden rounded-lg border border-(--color-border)">
          {([
            { value: "single" as const, label: "1社ずつ" },
            { value: "batch" as const, label: "まとめて" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={mode === opt.value}
              onClick={() => { setMode(opt.value); setBatchItems([]); setSelectedCompanyIds(new Set()); }}
              disabled={isBusy}
              className={modeTabClass(mode === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {(missingServices || missingPersonas) && (
        <div className="animate-fade-in flex gap-2.5 rounded-xl border border-(--color-warning) bg-(--color-warning-light) p-4 text-sm">
          <Warning className="mt-0.5 shrink-0 text-(--color-warning-text)" size={20} weight="fill" />
          <div className="space-y-1 leading-relaxed">
            {missingServices && (
              <p className="text-(--color-foreground)">
                サービスが未登録です。
                <Link href="/settings/services" className="ml-1 font-medium text-(--color-primary-text) underline underline-offset-2">
                  サービスを登録
                </Link>
              </p>
            )}
            {missingPersonas && (
              <p className="text-(--color-foreground)">
                人格が未登録です。
                <Link href="/settings/personas" className="ml-1 font-medium text-(--color-primary-text) underline underline-offset-2">
                  人格を登録
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 左: 基本設定（ここだけ埋めれば作れる） */}
        <div className={`${CARD} space-y-4 p-5`}>
          <h2 className="flex items-center gap-2 border-b border-(--color-border) pb-2.5 text-[15px] font-semibold">
            <Package size={16} className="text-(--color-primary-text)" />
            基本設定
          </h2>

          <div>
            <label className={LABEL} htmlFor="gen-service">サービス</label>
            <div className="relative">
              <select
                id="gen-service"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                disabled={isBusy || loadingOptions}
                className={`${SELECT} disabled:opacity-50`}
              >
                <option value="">選択してください</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)" size={16} weight="bold" />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="gen-persona">送信者（人格）</label>
            <div className="relative">
              <select
                id="gen-persona"
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                disabled={isBusy || loadingOptions}
                className={`${SELECT} disabled:opacity-50`}
              >
                <option value="">選択してください</option>
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>{persona.name}（{persona.title}）</option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)" size={16} weight="bold" />
            </div>
          </div>

          {mode === "single" ? (
            <div>
              <label className={LABEL} htmlFor="gen-url">企業URL</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)">
                  <Globe size={18} />
                </span>
                <input
                  id="gen-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isBusy}
                  placeholder="https://example.co.jp"
                  className={`${FIELD} pl-10 disabled:opacity-50`}
                />
              </div>
            </div>
          ) : (
            <CompanyPicker
              companies={companies}
              emailCompanyIds={companyIdsWithEmail}
              sentDomains={sentDomains}
              generatedDomains={generatedDomains}
              selectedIds={selectedCompanyIds}
              onToggle={(id) => {
                setSelectedCompanyIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onToggleAll={(ids) => setSelectedCompanyIds(ids)}
              search={companySearch}
              onSearchChange={setCompanySearch}
              disabled={isBusy}
              initialServiceName={activeServiceName}
            />
          )}

          <button
            type="button"
            onClick={() => (mode === "single" ? handleGenerate() : handleBatchGenerate())}
            disabled={!canSubmit}
            className={`${BTN_PRIMARY} w-full`}
          >
            {isBusy ? (
              <>
                <SpinnerGap className="animate-spin" size={18} />
                生成中...
              </>
            ) : (
              <>
                <PaperPlaneTilt size={18} weight="fill" />
                {mode === "single" ? "メールを生成" : `${batchTargetUrls.length || ""}社 まとめて生成`}
              </>
            )}
          </button>
        </div>

        {/* 右: 詳しい設定（初期は畳む。触らなくても作れる） */}
        <AdvancedPanel
          open={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
          templates={templates}
          templateId={selectedTemplateId}
          onTemplateId={setSelectedTemplateId}
          tone={tone}
          onTone={setTone}
          length={length}
          onLength={setLength}
          cta={cta}
          onCta={setCta}
          fixedText={fixedText}
          onFixedText={setFixedText}
          additionalInstructions={additionalInstructions}
          onAdditionalInstructions={setAdditionalInstructions}
          disabled={isBusy}
        />
      </div>

      {mode === "batch" && batchItems.length > 0 && (
        <div ref={batchProgressRef}>
          <BatchProgress
            items={batchItems}
            running={batchRunning}
            onStop={() => { abortRef.current = true; abortControllerRef.current?.abort(); }}
          />
        </div>
      )}

      {mode === "single" && isBusy && <ProgressCard status={status} />}

      {mode === "single" && status === "duplicate" && duplicateProspect && (
        <DuplicateDialog
          prospect={duplicateProspect}
          onView={() => router.push(`/prospect/${duplicateProspect.id}`)}
          onForceNew={() => handleGenerate({ force: true })}
          onCancel={resetToIdle}
        />
      )}

      {mode === "single" && status === "low-compat" && lowCompatAnalysis && (
        <LowCompatDialog
          analysis={lowCompatAnalysis}
          onForce={() => handleGenerate({ forceLow: true })}
          onCancel={resetToIdle}
        />
      )}

      {mode === "single" && status === "error" && error && (
        <ErrorCard message={error} onRetry={() => handleGenerate()} />
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense>
      <GeneratePageInner />
    </Suspense>
  );
}
