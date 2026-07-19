import type { CollectionPauseKind, CollectionRun, CollectionSource } from "@/lib/types";

export interface PausedSourceSummary {
  id: number;
  keyword: string;
  kind: CollectionPauseKind;
  reason: string;
}

export interface CollectionStatus {
  readyCount: number;
  pendingEnrichment: number;
  failedEnrichment: number;
  totalCompanies: number;
  dailyPace: number;
  daysRemaining: number;
  /** 送信実績がまだ無く、仮のペースで残日数を出しているか */
  isPaceEstimated: boolean;
  isLowStock: boolean;
  lowStockThresholdDays: number;
  activeSources: number;
  pausedSources: PausedSourceSummary[];
  hasBlockedSource: boolean;
  lastRunAt: string | null;
}

export interface SourcesResponse {
  sources: CollectionSource[];
  runs: CollectionRun[];
}
