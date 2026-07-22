import {
  finishCollectionRun,
  findCompanyByName,
  getRunnableCollectionSources,
  getSetting,
  pauseCollectionSource,
  setCollectionSourceSite,
  startCollectionRun,
  updateCollectionCursor,
  upsertCompany,
} from "@/lib/db";
import {
  SearchBlockedError,
  decideSearchSite,
  extractCompanies,
  webSearch,
  type SearchResultItem,
} from "@/lib/keyword-search";
import { scrapeSearch } from "@/lib/keyword-search-scrape";
import {
  fetchWantedlyListings,
  fetchWantedlyListingsFromUrl,
  type WantedlyFetchResult,
} from "@/lib/wantedly-scraper";
import type { CollectionRunStatus, CollectionSource } from "@/lib/types";

/** 1回の実行で進める検索ページ数。まとめて叩かず少しずつ掘る */
const PAGES_PER_RUN = 3;
/** 検索結果はこの辺りから精度が落ちるので、超えたら先頭へ戻して新着を拾い直す */
const MAX_PAGE = 9;
const MAX_COMPANIES_PER_RUN = 30;

/**
 * 「検索結果が0件」がこの回数続いたら止める。
 * ブロックかHTML構造の変更のどちらかであり、叩き続けると状況が悪化する。
 */
const NO_RESULT_PAUSE_THRESHOLD = 3;

/**
 * 「検索結果はあるが新規企業が0件」がこの回数続いたら止める。
 * こちらは障害ではなくキーワードの掘り尽くし。混同すると枯渇を障害として報告し続ける。
 */
const NO_NEW_PAUSE_THRESHOLD = 5;

/** 検索リクエストの間隔。固定値だと機械的なパターンとして目立つのでゆらぎを持たせる */
const REQUEST_DELAY_BASE_MS = 3000;
const REQUEST_DELAY_JITTER_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextRequestDelay(): number {
  return REQUEST_DELAY_BASE_MS + Math.floor(Math.random() * REQUEST_DELAY_JITTER_MS);
}

/** 収集をスキップした理由の内訳。実行ログに残して後から説明できるようにする */
type SkipBreakdown = Record<string, number>;

function addSkip(breakdown: SkipBreakdown, reason: string): void {
  breakdown[reason] = (breakdown[reason] ?? 0) + 1;
}

async function resolveSite(source: CollectionSource): Promise<string> {
  if (source.site) return source.site;

  const decision = await decideSearchSite(source.keyword);
  // 次回以降は同じサイトを使う。毎回AIに聞くと結果がぶれて差分カーソルが意味を失う
  setCollectionSourceSite(source.id, decision.site);
  return decision.site;
}

interface FetchOutcome {
  items: SearchResultItem[];
  /** 次回このページから再開する */
  nextPage: number;
}

/**
 * 差分取得。前回の続きのページから PAGES_PER_RUN ページ分だけ取る。
 * スクレイピングモードはページ指定に対応していないため常に先頭を取り、
 * 「新規が出るか」だけで枯渇を判断する。
 */
async function fetchPages(source: CollectionSource, site: string): Promise<FetchOutcome> {
  const query = `site:${site} ${source.keyword}`;
  const mode = getSetting("search_mode") || "api";

  if (mode === "scrape") {
    const items = await scrapeSearch(query);
    return { items, nextPage: 0 };
  }

  const apiKey = getSetting("serper_api_key") || process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("検索APIが未設定です。設定ページからAPIキーを登録してください");
  }

  const items: SearchResultItem[] = [];
  let page = source.next_page;

  for (let i = 0; i < PAGES_PER_RUN; i++) {
    if (i > 0) await sleep(nextRequestDelay());

    const pageItems = await webSearch(apiKey, query, page);
    items.push(...pageItems);
    page += 1;

    // 結果が尽きたら以降のページを叩かない
    if (pageItems.length === 0) break;
    if (page > MAX_PAGE) break;
  }

  return { items, nextPage: page > MAX_PAGE ? 0 : page };
}

interface SourceOutcome {
  status: CollectionRunStatus;
  newCount: number;
  pausedReason: string | null;
}

/**
 * 収集した企業名を登録する。この段階では企業名しか無いので名前でしか重複判定できない。
 * 送信済み・抑止対象との照合はドメインが要るため、裏処理（lib/enrichment.ts）で行う。
 */
function registerCompanies(
  companies: { name: string; sourceUrl: string }[],
  source: CollectionSource,
  site: string
): { newCount: number; breakdown: SkipBreakdown } {
  const breakdown: SkipBreakdown = {};
  let newCount = 0;

  for (const company of companies) {
    if (findCompanyByName(company.name)) {
      addSkip(breakdown, "登録済み");
      continue;
    }

    upsertCompany({
      name: company.name,
      domain: null,
      source: "auto_collection",
      source_detail: `${source.keyword} / ${site}`,
      hp_url: null,
      lp_url: null,
      recruit_page_url: null,
      collection_source_id: source.id,
    });
    newCount += 1;
  }

  return { newCount, breakdown };
}

/** 連続カウンタが閾値に達したかを見て、停止すべきなら理由を返す */
function decidePause(
  noResultRuns: number,
  noNewRuns: number
): { kind: "blocked" | "exhausted"; reason: string } | null {
  if (noResultRuns >= NO_RESULT_PAUSE_THRESHOLD) {
    return {
      kind: "blocked",
      reason: `検索結果が${noResultRuns}回連続で0件でした。アクセスがブロックされたか、検索元のHTML構造が変わった可能性があります`,
    };
  }
  if (noNewRuns >= NO_NEW_PAUSE_THRESHOLD) {
    return {
      kind: "exhausted",
      reason: `${noNewRuns}回連続で新しい企業が見つかりませんでした。このキーワードは掘り尽くした可能性があります`,
    };
  }
  return null;
}

type ListingFetcher = (startPage: number) => Promise<WantedlyFetchResult>;

function runWantedlySource(source: CollectionSource): Promise<SourceOutcome> {
  return runListingSource(source, (startPage) => fetchWantedlyListings(startPage), "wantedly.com");
}

/** 貼り付けられた Wantedly 検索URLから収集する（新着ではなく、そのURLの結果を page 送り） */
function runWantedlyUrlSource(source: CollectionSource): Promise<SourceOutcome> {
  const url = source.url ?? "";
  return runListingSource(source, (startPage) => fetchWantedlyListingsFromUrl(url, startPage), "wantedly.com");
}

async function runListingSource(
  source: CollectionSource,
  fetchListings: ListingFetcher,
  siteLabel: string
): Promise<SourceOutcome> {
  const runId = startCollectionRun(source.id, source.next_page);

  try {
    const startPage = source.next_page || 1;
    const { listings, nextPage, emptyPages } = await fetchListings(startPage);

    if (listings.length === 0) {
      const noResultRuns = source.consecutive_no_result_runs + emptyPages;
      updateCollectionCursor(source.id, {
        nextPage,
        consecutiveNoResultRuns: noResultRuns,
        consecutiveNoNewRuns: source.consecutive_no_new_runs,
      });
      finishCollectionRun(runId, {
        status: "no_result",
        foundCount: 0,
        newCount: 0,
        skippedCount: 0,
        skipBreakdown: {},
      });

      const pause = decidePause(noResultRuns, source.consecutive_no_new_runs);
      if (pause) {
        pauseCollectionSource(source.id, pause.kind, pause.reason);
        return { status: "no_result", newCount: 0, pausedReason: pause.reason };
      }
      return { status: "no_result", newCount: 0, pausedReason: null };
    }

    const companies = listings.map((l) => ({
      name: l.companyName,
      sourceUrl: l.listingUrl,
    }));
    const { newCount, breakdown } = registerCompanies(
      companies,
      source,
      siteLabel
    );

    const noNewRuns = newCount > 0 ? 0 : source.consecutive_no_new_runs + 1;
    updateCollectionCursor(source.id, {
      nextPage,
      consecutiveNoResultRuns: 0,
      consecutiveNoNewRuns: noNewRuns,
    });
    finishCollectionRun(runId, {
      status: newCount > 0 ? "success" : "no_new",
      foundCount: companies.length,
      newCount,
      skippedCount: companies.length - newCount,
      skipBreakdown: breakdown,
    });

    const pause = decidePause(0, noNewRuns);
    if (pause) {
      pauseCollectionSource(source.id, pause.kind, pause.reason);
      return { status: newCount > 0 ? "success" : "no_new", newCount, pausedReason: pause.reason };
    }
    return { status: newCount > 0 ? "success" : "no_new", newCount, pausedReason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wantedlyの収集に失敗しました";
    finishCollectionRun(runId, {
      status: "error",
      foundCount: 0,
      newCount: 0,
      skippedCount: 0,
      skipBreakdown: {},
      error: message,
    });

    const noResultRuns = source.consecutive_no_result_runs + 1;
    updateCollectionCursor(source.id, {
      nextPage: source.next_page,
      consecutiveNoResultRuns: noResultRuns,
      consecutiveNoNewRuns: source.consecutive_no_new_runs,
    });

    const pause = decidePause(noResultRuns, source.consecutive_no_new_runs);
    if (pause) {
      pauseCollectionSource(source.id, pause.kind, pause.reason);
      return { status: "error", newCount: 0, pausedReason: pause.reason };
    }
    return { status: "error", newCount: 0, pausedReason: null };
  }
}

async function runKeywordSource(source: CollectionSource): Promise<SourceOutcome> {
  const runId = startCollectionRun(source.id, source.next_page);

  try {
    const site = await resolveSite(source);
    const { items, nextPage } = await fetchPages(source, site);

    if (items.length === 0) {
      const noResultRuns = source.consecutive_no_result_runs + 1;
      updateCollectionCursor(source.id, {
        // 0件だったページを次も叩いても仕方ないので先頭に戻す
        nextPage: 0,
        consecutiveNoResultRuns: noResultRuns,
        consecutiveNoNewRuns: source.consecutive_no_new_runs,
      });
      finishCollectionRun(runId, {
        status: "no_result",
        foundCount: 0,
        newCount: 0,
        skippedCount: 0,
        skipBreakdown: {},
      });

      const pause = decidePause(noResultRuns, source.consecutive_no_new_runs);
      if (pause) {
        pauseCollectionSource(source.id, pause.kind, pause.reason);
        return { status: "no_result", newCount: 0, pausedReason: pause.reason };
      }
      return { status: "no_result", newCount: 0, pausedReason: null };
    }

    const extraction = await extractCompanies(
      source.keyword,
      site,
      items,
      MAX_COMPANIES_PER_RUN
    );
    const { newCount, breakdown } = registerCompanies(extraction.companies, source, site);

    const noNewRuns = newCount > 0 ? 0 : source.consecutive_no_new_runs + 1;
    updateCollectionCursor(source.id, {
      nextPage,
      consecutiveNoResultRuns: 0,
      consecutiveNoNewRuns: noNewRuns,
    });
    finishCollectionRun(runId, {
      status: newCount > 0 ? "success" : "no_new",
      foundCount: extraction.companies.length,
      newCount,
      skippedCount: extraction.companies.length - newCount,
      skipBreakdown: breakdown,
    });

    const pause = decidePause(0, noNewRuns);
    if (pause) {
      pauseCollectionSource(source.id, pause.kind, pause.reason);
      return { status: newCount > 0 ? "success" : "no_new", newCount, pausedReason: pause.reason };
    }
    return { status: newCount > 0 ? "success" : "no_new", newCount, pausedReason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "収集に失敗しました";
    finishCollectionRun(runId, {
      status: "error",
      foundCount: 0,
      newCount: 0,
      skippedCount: 0,
      skipBreakdown: {},
      error: message,
    });

    // 叩き過ぎ・拒否は再試行せず即座に止める。続けると状況が悪化する
    if (error instanceof SearchBlockedError) {
      const reason = `検索元から拒否されました（${error.status}）。時間を置いてから再開してください`;
      pauseCollectionSource(source.id, "blocked", reason);
      return { status: "error", newCount: 0, pausedReason: reason };
    }

    const noResultRuns = source.consecutive_no_result_runs + 1;
    updateCollectionCursor(source.id, {
      nextPage: source.next_page,
      consecutiveNoResultRuns: noResultRuns,
      consecutiveNoNewRuns: source.consecutive_no_new_runs,
    });

    const pause = decidePause(noResultRuns, source.consecutive_no_new_runs);
    if (pause) {
      pauseCollectionSource(source.id, pause.kind, pause.reason);
      return { status: "error", newCount: 0, pausedReason: pause.reason };
    }
    return { status: "error", newCount: 0, pausedReason: null };
  }
}

function runSource(source: CollectionSource): Promise<SourceOutcome> {
  if (source.source_type === "wantedly_direct") {
    return runWantedlySource(source);
  }
  if (source.source_type === "wantedly_url") {
    return runWantedlyUrlSource(source);
  }
  return runKeywordSource(source);
}

export interface PausedSourceNotice {
  keyword: string;
  reason: string;
}

export interface CollectionCycleResult {
  ranSources: number;
  newCompanies: number;
  paused: PausedSourceNotice[];
}

/**
 * 収集を1周する。ソースは同時実行せず順番に処理する（同時に叩くと検知されやすい）。
 */
export async function runCollectionCycle(): Promise<CollectionCycleResult> {
  const sources = getRunnableCollectionSources();
  const paused: PausedSourceNotice[] = [];
  let newCompanies = 0;

  for (const [index, source] of sources.entries()) {
    if (index > 0) await sleep(nextRequestDelay());

    const outcome = await runSource(source);
    newCompanies += outcome.newCount;
    if (outcome.pausedReason) {
      paused.push({ keyword: source.keyword, reason: outcome.pausedReason });
    }
  }

  return { ranSources: sources.length, newCompanies, paused };
}
