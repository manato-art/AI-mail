"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PaperPlaneTilt,
  Globe,
  CaretDown,
  Check,
  SpinnerGap,
  Warning,
  Lock,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type {
  AnalysisResult,
  Company,
  Persona,
  Prospect,
  QualityCheckResult,
  Service,
  Template,
} from "@/lib/types";
import { BatchProgress, type BatchItem } from "./batch-progress";

type Status =
  | "idle"
  | "crawling"
  | "analyzing"
  | "generating"
  | "done"
  | "error"
  | "duplicate"
  | "low-compat";

interface GenerateSuccessResponse {
  prospect: Prospect;
  qualityCheck: QualityCheckResult;
}

interface DuplicateResponse {
  duplicate: true;
  existingProspect: Prospect;
}

interface LowCompatibilityResponse {
  lowCompatibility: true;
  analysis: AnalysisResult;
}

interface ErrorResponse {
  error: string;
}

type GenerateResponse =
  | GenerateSuccessResponse
  | DuplicateResponse
  | LowCompatibilityResponse
  | ErrorResponse;

function isSuccessResponse(
  data: GenerateResponse
): data is GenerateSuccessResponse {
  return (data as GenerateSuccessResponse).prospect !== undefined;
}

function isDuplicateResponse(
  data: GenerateResponse
): data is DuplicateResponse {
  return (data as DuplicateResponse).duplicate === true;
}

function isLowCompatibilityResponse(
  data: GenerateResponse
): data is LowCompatibilityResponse {
  return (data as LowCompatibilityResponse).lowCompatibility === true;
}

function isErrorResponse(data: GenerateResponse): data is ErrorResponse {
  return typeof (data as ErrorResponse).error === "string";
}

const PROGRESS_STEPS = [
  { key: "crawling", label: "企業HPを取得中", sub: "Webサイトをクロールしています" },
  { key: "analyzing", label: "企業を分析中", sub: "事業内容と相性を判定しています" },
  { key: "generating", label: "メールを作成中", sub: "パーソナライズされた文面を生成しています" },
] as const;

const STEP_DELAY_MS = 2000;

function GeneratePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const [companies, setCompanies] = useState<Company[]>([]);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<number>>(new Set());
  const [companySearch, setCompanySearch] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const abortRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duplicateProspect, setDuplicateProspect] = useState<Prospect | null>(
    null
  );
  const [lowCompatAnalysis, setLowCompatAnalysis] =
    useState<AnalysisResult | null>(null);

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
        const [servicesRes, personasRes, templatesRes, companiesRes] = await Promise.all([
          fetch("/api/services"),
          fetch("/api/personas"),
          fetch("/api/templates"),
          fetch("/api/companies"),
        ]);
        const servicesData: Service[] = servicesRes.ok
          ? await servicesRes.json()
          : [];
        const personasData: Persona[] = personasRes.ok
          ? await personasRes.json()
          : [];
        const templatesData: Template[] = templatesRes.ok
          ? await templatesRes.json()
          : [];
        const companiesData = companiesRes.ok
          ? await companiesRes.json()
          : { companies: [] };
        if (!cancelled) {
          setServices(servicesData);
          setPersonas(personasData);
          setTemplates(templatesData);
          setCompanies(
            (companiesData.companies as Company[]).filter((c) => c.hp_url && c.enrichment_status === "done")
          );
        }
      } catch {
        if (!cancelled) {
          setServices([]);
          setPersonas([]);
          setTemplates([]);
          setCompanies([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
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
    if (paramService && services.some((s) => String(s.id) === paramService)) {
      setSelectedServiceId(paramService);
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
      setError(
        err instanceof Error ? err.message : "通信エラーが発生しました。"
      );
    }
  }

  async function handleBatchGenerate() {
    if (!selectedServiceId || !selectedPersonaId || batchTargetUrls.length === 0) return;

    const items: BatchItem[] = batchTargetUrls.map((u) => ({ url: u, status: "waiting" as const }));
    setBatchItems(items);
    setBatchRunning(true);
    abortRef.current = false;

    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break;

      setBatchItems((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "processing" } : item))
      );

      const MAX_RETRIES = 1;
      let lastError = "";

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const waitMs = attempt * 3000;
          await new Promise((r) => setTimeout(r, waitMs));
          if (abortRef.current) break;
        }

        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceId: Number(selectedServiceId),
              personaId: Number(selectedPersonaId),
              url: items[i].url,
              force: false,
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
            lastError = "";
            break;
          } else if (isDuplicateResponse(data)) {
            setBatchItems((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, status: "skipped", skipReason: "生成済み", prospectId: data.existingProspect.id, companyName: data.existingProspect.company_name } : item
              )
            );
            lastError = "";
            break;
          } else if (isLowCompatibilityResponse(data)) {
            setBatchItems((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, status: "skipped", skipReason: "相性低" } : item
              )
            );
            lastError = "";
            break;
          } else if (isErrorResponse(data)) {
            lastError = data.error;
            const retryable = "retryable" in data && (data as { retryable?: boolean }).retryable;
            if (!retryable || attempt >= MAX_RETRIES) {
              setBatchItems((prev) =>
                prev.map((item, idx) =>
                  idx === i ? { ...item, status: "error", error: data.error } : item
                )
              );
              lastError = "";
              break;
            }
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : "通信エラー";
          if (attempt >= MAX_RETRIES) {
            setBatchItems((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, status: "error", error: lastError } : item
              )
            );
            lastError = "";
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

    setBatchRunning(false);
  }

  const missingServices = !loadingOptions && services.length === 0;
  const missingPersonas = !loadingOptions && personas.length === 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">営業メールを作成</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            企業URLを入力すると、HPを自動分析してパーソナライズされた営業メールを生成します
          </p>
        </div>
        <div className="flex rounded-lg border border-(--color-border) overflow-hidden">
          {([
            { value: "single" as const, label: "1社" },
            { value: "batch" as const, label: "まとめて" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setMode(opt.value); setBatchItems([]); setSelectedCompanyIds(new Set()); }}
              disabled={isBusy}
              className={`h-8 px-4 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                mode === opt.value
                  ? "bg-(--color-primary) text-white"
                  : "bg-white dark:bg-slate-800 text-(--color-muted) hover:bg-gray-50 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {(missingServices || missingPersonas) && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-(--color-warning-light) p-4 text-sm animate-fade-in">
          <Warning className="shrink-0 mt-0.5" size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
          <div className="space-y-1">
            {missingServices && (
              <p className="text-gray-700 dark:text-gray-300">
                サービスが未登録です。
                <Link href="/settings/services" className="text-(--color-primary) font-medium underline underline-offset-2 ml-1">
                  サービスを登録
                </Link>
              </p>
            )}
            {missingPersonas && (
              <p className="text-gray-700 dark:text-gray-300">
                人格が未登録です。
                <Link href="/settings/personas" className="text-(--color-primary) font-medium underline underline-offset-2 ml-1">
                  人格を登録
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左カラム: 基本入力 */}
        <div className="rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-(--color-border) pb-2.5">
            基本設定
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              サービス
            </label>
            <div className="relative">
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                disabled={isBusy || loadingOptions}
                className="w-full h-11 px-3 pr-9 border border-(--color-border) rounded-lg bg-white dark:bg-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
              >
                <option value="">選択してください</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
              <CaretDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} weight="bold" color="#9ca3af" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              送信者（人格）
            </label>
            <div className="relative">
              <select
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                disabled={isBusy || loadingOptions}
                className="w-full h-11 px-3 pr-9 border border-(--color-border) rounded-lg bg-white dark:bg-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
              >
                <option value="">選択してください</option>
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>{persona.name}（{persona.title}）</option>
                ))}
              </select>
              <CaretDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} weight="bold" color="#9ca3af" />
            </div>
          </div>

          {mode === "single" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                企業URL
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Globe size={20} />
                </div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isBusy}
                  placeholder="https://example.co.jp"
                  className="w-full h-11 pl-10 pr-3 border border-(--color-border) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
                />
              </div>
            </div>
          ) : (
            <CompanyPicker
              companies={companies}
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
            />
          )}

          <button
            type="button"
            onClick={() => mode === "single" ? handleGenerate() : handleBatchGenerate()}
            disabled={!canSubmit}
            className="w-full h-11 rounded-lg bg-(--color-primary) hover:bg-(--color-primary-hover) text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
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

        {/* 右カラム: カスタマイズ */}
        <div className="rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-(--color-border) pb-2.5">
            カスタマイズ
          </h2>

          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-1.5">テンプレート</label>
            {templates.length > 0 ? (
              <>
                <div className="relative">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={isBusy}
                    className="w-full h-11 px-3 pr-9 border border-(--color-border) rounded-lg bg-white dark:bg-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
                  >
                    <option value="">使用しない（自由生成）</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <CaretDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} weight="bold" color="#9ca3af" />
                </div>
                {selectedTemplateId && (
                  <p className="mt-1 text-[11px] text-(--color-muted)">
                    テンプレートの構成に沿ってメールを生成します
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-(--color-muted)">
                テンプレートがありません。
                <Link href="/settings/templates" className="text-(--color-primary) font-medium underline underline-offset-2 ml-1">
                  作成する
                </Link>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-2">トーン</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "formal", label: "丁寧・堅め" },
                { value: "balanced", label: "バランス" },
                { value: "friendly", label: "親しみやすい" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTone(opt.value)}
                  disabled={isBusy}
                  className={`h-8 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    tone === opt.value
                      ? "bg-(--color-primary) text-white"
                      : "border border-(--color-border) text-gray-600 dark:text-gray-400 hover:border-(--color-primary) hover:text-(--color-primary)"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-2">文章量</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "short", label: "短め（200字）" },
                { value: "standard", label: "標準（300字）" },
                { value: "long", label: "長め（450字）" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLength(opt.value)}
                  disabled={isBusy}
                  className={`h-8 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    length === opt.value
                      ? "bg-(--color-primary) text-white"
                      : "border border-(--color-border) text-gray-600 dark:text-gray-400 hover:border-(--color-primary) hover:text-(--color-primary)"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-2">行動喚起（CTA）</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "online_meeting", label: "オンライン商談" },
                { value: "phone", label: "電話" },
                { value: "send_materials", label: "資料送付" },
                { value: "seminar", label: "セミナー招待" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCta(opt.value)}
                  disabled={isBusy}
                  className={`h-8 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    cta === opt.value
                      ? "bg-(--color-primary) text-white"
                      : "border border-(--color-border) text-gray-600 dark:text-gray-400 hover:border-(--color-primary) hover:text-(--color-primary)"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-(--color-muted) mb-1.5">
              <Lock size={12} />
              固定テキスト（任意）
            </label>
            <textarea
              rows={3}
              value={fixedText}
              onChange={(e) => setFixedText(e.target.value)}
              disabled={isBusy}
              placeholder={"全メールにそのまま入る文章を書きます\n例: 弊社は〇〇分野で10年の実績があり…"}
              className="w-full rounded-lg border border-(--color-border) px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
            />
            {fixedText.trim() && (
              <p className="mt-1 text-[11px] text-(--color-muted)">
                この文章はAIが改変せず、全メールにそのまま挿入されます
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-(--color-muted) mb-1.5">
              追加の指示（任意）
            </label>
            <textarea
              rows={2}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              disabled={isBusy}
              placeholder="例: 導入事例に触れてほしい、価格には触れないで、など"
              className="w-full rounded-lg border border-(--color-border) px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-transparent disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-slate-700 transition-shadow"
            />
          </div>
        </div>
      </div>

      {mode === "batch" && batchItems.length > 0 && (
        <BatchProgress
          items={batchItems}
          running={batchRunning}
          onStop={() => { abortRef.current = true; }}
        />
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

function CompanyPicker({
  companies,
  selectedIds,
  onToggle,
  onToggleAll,
  search,
  onSearchChange,
  disabled,
}: {
  companies: Company[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: Set<number>) => void;
  search: string;
  onSearchChange: (v: string) => void;
  disabled: boolean;
}) {
  const filtered = search.trim()
    ? companies.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.domain ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : companies;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  function handleToggleAll() {
    if (allFilteredSelected) {
      const removeIds = new Set(filtered.map((c) => c.id));
      onToggleAll(new Set([...selectedIds].filter((id) => !removeIds.has(id))));
    } else {
      onToggleAll(new Set([...selectedIds, ...filtered.map((c) => c.id)]));
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        送信先の企業を選択
      </label>
      <div className="border border-(--color-border) rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-(--color-border) bg-gray-50 dark:bg-slate-700/50">
          <MagnifyingGlass size={16} className="shrink-0 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
            placeholder="企業名で検索..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 disabled:opacity-50"
          />
          {selectedIds.size > 0 && (
            <span className="shrink-0 rounded-full bg-(--color-primary) px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {selectedIds.size}
            </span>
          )}
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-(--color-muted)">
              {companies.length === 0
                ? "調査済みの企業がありません"
                : "該当する企業がありません"}
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2.5 px-3 py-2 border-b border-(--color-border) bg-gray-50/50 dark:bg-slate-700/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleToggleAll}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-gray-300 accent-(--color-primary) cursor-pointer"
                />
                <span className="text-[12px] font-medium text-(--color-muted)">
                  すべて選択（{filtered.length}社）
                </span>
              </label>
              {filtered.map((company) => (
                <label
                  key={company.id}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(company.id)}
                    onChange={() => onToggle(company.id)}
                    disabled={disabled}
                    className="h-4 w-4 shrink-0 rounded border-gray-300 accent-(--color-primary) cursor-pointer"
                  />
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-medium">{company.name}</span>
                    {company.domain && (
                      <span className="ml-1.5 text-(--color-muted) text-[11px]">
                        {company.domain}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ status }: { status: Status }) {
  const currentIndex = PROGRESS_STEPS.findIndex((step) => step.key === status);
  const pctMap: Record<string, number> = { crawling: 15, analyzing: 50, generating: 85 };
  const pct = pctMap[status] ?? 0;

  return (
    <div className="mt-5 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-5 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {PROGRESS_STEPS[currentIndex]?.label ?? "処理中"}
        </p>
        <span className="text-xs tabular-nums text-(--color-muted)">{pct}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-(--color-primary) transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-4">
        {PROGRESS_STEPS.map((step, index) => {
          const isDone = currentIndex > index;
          const isCurrent = currentIndex === index;
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className="mt-0.5">
                {isDone ? (
                  <div className="h-6 w-6 rounded-full bg-(--color-success-light) flex items-center justify-center">
                    <Check size={16} weight="bold" style={{ color: "var(--color-success)" }} />
                  </div>
                ) : isCurrent ? (
                  <div className="h-6 w-6 rounded-full bg-(--color-primary-light) flex items-center justify-center relative">
                    <div className="absolute inset-0 rounded-full bg-(--color-primary) opacity-20 animate-pulse-ring" />
                    <div className="h-2.5 w-2.5 rounded-full bg-(--color-primary)" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-gray-200" />
                )}
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${
                    isCurrent
                      ? "text-gray-900 dark:text-gray-100"
                      : isDone
                        ? "text-gray-500"
                        : "text-gray-400"
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-xs text-(--color-muted) mt-0.5">
                    {step.sub}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DuplicateDialog({
  prospect,
  onView,
  onForceNew,
  onCancel,
}: {
  prospect: Prospect;
  onView: () => void;
  onForceNew: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-(--color-warning-light) p-5 animate-fade-in">
      <div className="flex gap-3">
        <Warning className="shrink-0 mt-0.5" size={24} weight="fill" style={{ color: "var(--color-warning)" }} />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            この企業は生成済みです
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {prospect.company_name || prospect.domain}{" "}
            宛のメールは既に作成されています。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onView}
              className="h-9 px-4 rounded-lg bg-(--color-primary) hover:bg-(--color-primary-hover) text-white text-sm font-medium transition-colors cursor-pointer"
            >
              過去の結果を見る
            </button>
            <button
              type="button"
              onClick={onForceNew}
              className="h-9 px-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              新規作成
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="h-9 px-4 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LowCompatDialog({
  analysis,
  onForce,
  onCancel,
}: {
  analysis: AnalysisResult;
  onForce: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-5 animate-fade-in">
      <div className="flex gap-3">
        <Warning className="shrink-0 mt-0.5" size={24} weight="fill" style={{ color: "var(--color-danger)" }} />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            相性が低い可能性があります
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {analysis.compatibility.reason}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onForce}
              className="h-9 px-4 rounded-lg bg-(--color-danger) hover:bg-(--color-danger-hover) text-white text-sm font-medium transition-colors cursor-pointer"
            >
              それでも生成する
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="h-9 px-4 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-red-200 dark:border-red-800 bg-(--color-danger-light) p-5 animate-fade-in">
      <div className="flex gap-3">
        <Warning className="shrink-0 mt-0.5" size={24} weight="fill" style={{ color: "var(--color-danger)" }} />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">エラーが発生しました</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 h-9 px-4 rounded-lg bg-(--color-primary) hover:bg-(--color-primary-hover) text-white text-sm font-medium transition-colors cursor-pointer"
          >
            再試行
          </button>
        </div>
      </div>
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
