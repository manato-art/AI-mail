"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

function isDuplicateResponse(data: GenerateResponse): data is DuplicateResponse {
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
  { key: "crawling", label: "HPを取得しています..." },
  { key: "analyzing", label: "企業を分析しています..." },
  { key: "generating", label: "メールを作成しています..." },
] as const;

const STEP_DELAY_MS = 2000;

export default function Home() {
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

  function resetToIdle() {
    setStatus("idle");
    setError(null);
    setDuplicateProspect(null);
    setLowCompatAnalysis(null);
  }

  async function handleGenerate(opts?: { force?: boolean; forceLow?: boolean }) {
    if (!selectedServiceId || !selectedPersonaId || !url.trim()) {
      return;
    }

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
    <div>
      <h1 className="text-2xl font-bold mb-6">営業メール作成</h1>

      {(missingServices || missingPersonas) && (
        <div className="mb-6 rounded-lg border border-[--color-border] bg-white p-4 text-sm text-gray-600 space-y-1">
          {missingServices && (
            <p>
              サービスが登録されていません。
              <Link
                href="/services"
                className="text-[--color-primary] underline underline-offset-2"
              >
                サービス管理
              </Link>
              から登録してください。
            </p>
          )}
          {missingPersonas && (
            <p>
              人格が登録されていません。
              <Link
                href="/personas"
                className="text-[--color-primary] underline underline-offset-2"
              >
                人格管理
              </Link>
              から登録してください。
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              サービス
            </label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              disabled={isBusy || loadingOptions}
              className="w-full h-10 px-3 border border-[--color-border] rounded-lg focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent disabled:opacity-50"
            >
              <option value="">選択してください</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              人格（送信者）
            </label>
            <select
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              disabled={isBusy || loadingOptions}
              className="w-full h-10 px-3 border border-[--color-border] rounded-lg focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent disabled:opacity-50"
            >
              <option value="">選択してください</option>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}（{persona.title}）
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              企業URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isBusy}
              placeholder="https://example.co.jp"
              className="w-full h-10 px-3 border border-[--color-border] rounded-lg focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-transparent disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={
              isBusy || !selectedServiceId || !selectedPersonaId || !url.trim()
            }
            className="h-10 px-6 rounded-lg bg-[--color-primary] hover:bg-[--color-primary-hover] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            生成
          </button>
        </div>
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
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <ul className="space-y-3">
        {PROGRESS_STEPS.map((step, index) => {
          const isDone = currentIndex > index;
          const isCurrent = currentIndex === index;
          return (
            <li key={step.key} className="flex items-center gap-3">
              {isDone ? (
                <CheckIcon />
              ) : isCurrent ? (
                <SpinnerIcon />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-gray-300" />
              )}
              <span
                className={
                  isCurrent
                    ? "text-gray-900 font-medium"
                    : isDone
                      ? "text-gray-500"
                      : "text-gray-400"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
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
    <div className="mt-6 rounded-lg border border-[--color-warning] bg-amber-50 p-6">
      <div className="flex gap-3">
        <WarningIcon className="text-[--color-warning]" />
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">
            この企業は生成済みです
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {prospect.company_name || prospect.domain}{" "}
            宛のメールは既に作成されています。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onView}
              className="bg-[--color-primary] hover:bg-[--color-primary-hover] text-white rounded-lg px-4 py-2 font-medium"
            >
              過去の結果を見る
            </button>
            <button
              type="button"
              onClick={onForceNew}
              className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
            >
              新規生成
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
            >
              中止
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
    <div className="mt-6 rounded-lg border border-[--color-danger] bg-red-50 p-6">
      <div className="flex gap-3">
        <WarningIcon className="text-[--color-danger]" />
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">
            相性が低い可能性があります
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {analysis.compatibility.reason}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onForce}
              className="bg-[--color-danger] hover:bg-[--color-danger-hover] text-white rounded-lg px-4 py-2"
            >
              それでも作る
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="border border-[--color-border] rounded-lg px-4 py-2 hover:bg-gray-50"
            >
              やめる
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
    <div className="mt-6 rounded-lg border border-[--color-danger] bg-red-50 p-6">
      <div className="flex gap-3">
        <WarningIcon className="text-[--color-danger]" />
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">エラーが発生しました</h2>
          <p className="mt-1 text-sm text-gray-600">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 bg-[--color-primary] hover:bg-[--color-primary-hover] text-white rounded-lg px-4 py-2 font-medium"
          >
            再試行
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-[--color-success]"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 00-1.408-1.42l-6.573 6.514-2.42-2.396a1 1 0 10-1.406 1.421l3.122 3.093a1 1 0 001.407 0l7.278-7.212z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 animate-spin text-[--color-primary]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function WarningIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-6 w-6 shrink-0 ${className}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}
