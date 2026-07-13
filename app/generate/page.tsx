"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PaperPlaneTilt,
  Globe,
  CaretDown,
  Check,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type {
  AnalysisResult,
  Persona,
  Prospect,
  QualityCheckResult,
  Service,
} from "@/lib/types";

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

export default function GeneratePage() {
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [url, setUrl] = useState("");

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
        const [servicesRes, personasRes] = await Promise.all([
          fetch("/api/services"),
          fetch("/api/personas"),
        ]);
        const servicesData: Service[] = servicesRes.ok
          ? await servicesRes.json()
          : [];
        const personasData: Persona[] = personasRes.ok
          ? await personasRes.json()
          : [];
        if (!cancelled) {
          setServices(servicesData);
          setPersonas(personasData);
        }
      } catch {
        if (!cancelled) {
          setServices([]);
          setPersonas([]);
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

  const isBusy =
    status === "crawling" || status === "analyzing" || status === "generating";

  const canSubmit =
    !isBusy &&
    !loadingOptions &&
    Boolean(selectedServiceId) &&
    Boolean(selectedPersonaId) &&
    Boolean(url.trim());

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

  const missingServices = !loadingOptions && services.length === 0;
  const missingPersonas = !loadingOptions && personas.length === 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">営業メールを作成</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          企業URLを入力すると、HPを自動分析してパーソナライズされた営業メールを生成します
        </p>
      </div>

      {(missingServices || missingPersonas) && (
        <div className="mb-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-(--color-warning-light) p-4 text-sm space-y-1 animate-fade-in">
          <div className="flex gap-2.5">
            <Warning className="shrink-0 mt-0.5" size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
            <div className="space-y-1">
              {missingServices && (
                <p className="text-gray-700 dark:text-gray-300">
                  サービスが未登録です。
                  <Link
                    href="/services"
                    className="text-(--color-primary) font-medium underline underline-offset-2 ml-1"
                  >
                    サービスを登録
                  </Link>
                </p>
              )}
              {missingPersonas && (
                <p className="text-gray-700 dark:text-gray-300">
                  人格が未登録です。
                  <Link
                    href="/personas"
                    className="text-(--color-primary) font-medium underline underline-offset-2 ml-1"
                  >
                    人格を登録
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-(--color-border) p-5 md:p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
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
                  <option key={persona.id} value={persona.id}>
                    {persona.name}（{persona.title}）
                  </option>
                ))}
              </select>
              <CaretDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} weight="bold" color="#9ca3af" />
            </div>
          </div>
        </div>

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

        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={!canSubmit}
          className="w-full h-12 rounded-xl bg-(--color-primary) hover:bg-(--color-primary-hover) text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99] cursor-pointer"
        >
          {isBusy ? (
            <>
              <SpinnerGap className="animate-spin" size={20} />
              生成中...
            </>
          ) : (
            <>
              <PaperPlaneTilt size={20} weight="fill" />
              メールを生成
            </>
          )}
        </button>
      </div>

      {isBusy && <ProgressCard status={status} />}

      {status === "duplicate" && duplicateProspect && (
        <DuplicateDialog
          prospect={duplicateProspect}
          onView={() => router.push(`/prospect/${duplicateProspect.id}`)}
          onForceNew={() => handleGenerate({ force: true })}
          onCancel={resetToIdle}
        />
      )}

      {status === "low-compat" && lowCompatAnalysis && (
        <LowCompatDialog
          analysis={lowCompatAnalysis}
          onForce={() => handleGenerate({ forceLow: true })}
          onCancel={resetToIdle}
        />
      )}

      {status === "error" && error && (
        <ErrorCard message={error} onRetry={() => handleGenerate()} />
      )}
    </div>
  );
}

function ProgressCard({ status }: { status: Status }) {
  const currentIndex = PROGRESS_STEPS.findIndex((step) => step.key === status);

  return (
    <div className="mt-5 rounded-xl border border-(--color-border) bg-white dark:bg-slate-800 p-5 animate-fade-in">
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
