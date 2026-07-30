import {
  finishCollectionRun,
  findCompanyByName,
  setCompanyListingUrl,
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
  SearchConfigError,
  decideSearchSite,
  extractCompanies,
  webSearch,
  type SearchResultItem,
} from "@/lib/keyword-search";
import { scrapeSearch } from "@/lib/keyword-search-scrape";
import { validateUrl } from "@/lib/ssrf";
import {
  fetchWantedlyListings,
  fetchWantedlyListingsFromUrl,
  type WantedlyFetchResult,
} from "@/lib/wantedly-scraper";
import type { CollectionRunStatus, CollectionSource } from "@/lib/types";
import { logActivity } from "@/lib/activity-log";

/** 正の整数の環境変数を読む。未設定・不正値・0以下・小数(0.5等)はデフォルトに倒す（運用でノブを回せるように） */
function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  // floor を先に取ってから正値判定する。逆順だと 0.5 が「>0」を通過して floor で 0 になり fallback を素通りする
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 1回の実行で進める検索ページ数。まとめて叩かず少しずつ掘る。
 * 収集量を増やしたい時は env COLLECTION_PAGES_PER_RUN で調整（既定=バランス設定の5）。
 */
const PAGES_PER_RUN = readIntEnv("COLLECTION_PAGES_PER_RUN", 5);
/** 検索結果はこの辺りから精度が落ちるので、超えたら先頭へ戻して新着を拾い直す */
const MAX_PAGE = 9;
/** 1ソース1回の登録上限。env COLLECTION_MAX_COMPANIES_PER_RUN で調整（既定=50） */
const MAX_COMPANIES_PER_RUN = readIntEnv("COLLECTION_MAX_COMPANIES_PER_RUN", 50);

/**
 * 1周期で回す収集元の数の上限。
 *
 * Wantedly の URL 巡回は1件あたり最大30ページ（1ページごとに3〜8秒の間隔）＝約3分。
 * 収集ジョブのロックは90分で切れるため、20件で約60分＝余裕を残す設定にしている。
 * 上限で切った分は「最終実行が古い順」の並びにより次の周期で順番が回る（切り捨てではない）。
 * env COLLECTION_MAX_SOURCES_PER_CYCLE で調整。
 */
const MAX_SOURCES_PER_CYCLE = readIntEnv("COLLECTION_MAX_SOURCES_PER_CYCLE", 20);

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
    // 設定エラーとして型で区別する（「HTML構造が変わった可能性」と表示して誤った調査に誘導しない）
    throw new SearchConfigError("検索APIが未設定です。設定ページからAPIキーを登録してください");
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
 * 掲載URLは外部（媒体HTML・AI抽出）由来なので、保存する前に必ず検証する。
 * 保存したURLは後段で実際にアクセスするため、ここを素通しにするとSSRFの入口になる。
 */
function sanitizeListingUrl(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const validated = validateUrl(trimmed);
  return validated.valid ? validated.normalized : null;
}

/**
 * 収集した企業名を登録する。この段階では企業名しか無いので名前でしか重複判定できない。
 * 送信済み・抑止対象との照合はドメインが要るため、裏処理（lib/enrichment.ts）で行う。
 *
 * 掲載URL（sourceUrl）は「その企業がどのページに載っていたか」の正準キー。
 * 捨てると裏処理が毎回社名で検索し直すことになり、検索が止まると全社が調査不能になる。
 */
function registerCompanies(
  companies: { name: string; sourceUrl: string }[],
  source: CollectionSource,
  site: string
): { newCount: number; breakdown: SkipBreakdown } {
  const breakdown: SkipBreakdown = {};
  let newCount = 0;

  for (const company of companies) {
    const existing = findCompanyByName(company.name);
    if (existing) {
      // 掲載URLを保存する前に集めた企業は listing_url が空のままで、
      // 裏処理が毎回「社名で検索」に落ちる（検索が止まると永久に調査できない）。
      // 再び媒体に出てきたこの機会に掲載URLだけ補充して、直取り経路に乗せる。
      const listingUrl = sanitizeListingUrl(company.sourceUrl);
      if (listingUrl && !(existing.listing_url ?? "").trim()) {
        setCompanyListingUrl(existing.id, listingUrl);
        addSkip(breakdown, "登録済み（掲載URLを補充）");
      } else {
        addSkip(breakdown, "登録済み");
      }
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
      listing_url: sanitizeListingUrl(company.sourceUrl),
      collection_source_id: source.id,
    });
    newCount += 1;
  }

  return { newCount, breakdown };
}

/**
 * 例外の型から「原因が分かっている停止理由」を作る。
 *
 * これが無いと、APIキー未設定も検索元のブロックも、連続0件として同じ文言
 * （「HTML構造が変わった可能性」）で表示され、運用者を誤った調査に誘導する。
 * 原因が分かっている場合は1サイクル目で正しい理由を出して止める。
 */
function describePauseForError(
  error: unknown
): { kind: "blocked"; reason: string } | null {
  if (error instanceof SearchConfigError) {
    return {
      kind: "blocked",
      reason: `検索APIの設定に問題があります（${error.message}）。設定ページで確認してください`,
    };
  }
  if (error instanceof SearchBlockedError) {
    return {
      kind: "blocked",
      reason: `検索元からアクセスを拒否されました（${error.status}）。時間を置いてから再開してください`,
    };
  }
  return null;
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

    // 企業ページURL（/companies/{slug}）は公式サイトURLを持つため、募集ページより優先して残す。
    // 取れなかった場合だけ募集ページURLを保存する（募集ページからでも企業ページを辿れる）
    const companies = listings.map((l) => ({
      name: l.companyName,
      sourceUrl: l.companyUrl || l.listingUrl,
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

    // 原因が分かっている失敗（拒否・設定不備）は連続カウンタを待たずに正しい理由で止める
    const known = describePauseForError(error);
    if (known) {
      pauseCollectionSource(source.id, known.kind, known.reason);
      return { status: "error", newCount: 0, pausedReason: known.reason };
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
    // AIが返す掲載URLは検索結果に無いものを創作しうる。実在したリンクと一致しない場合は
    // 保存しない（保存したURLは後段で実際にアクセスするため、出所を機械的に保証する）
    const actualLinks = new Set(items.map((item) => item.link).filter(Boolean));
    const companies = extraction.companies.map((c) => ({
      name: c.name,
      sourceUrl: actualLinks.has(c.sourceUrl) ? c.sourceUrl : "",
    }));
    const { newCount, breakdown } = registerCompanies(companies, source, site);

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

    // 原因が分かっている失敗（拒否・設定不備）は再試行せず即座に、正しい理由で止める
    const known = describePauseForError(error);
    if (known) {
      pauseCollectionSource(source.id, known.kind, known.reason);
      return { status: "error", newCount: 0, pausedReason: known.reason };
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
  /** 収集対象のうち、この周期では順番が回らなかった件数（黙って切らずに必ず報告する） */
  skippedByCap: number;
}

/**
 * 収集を1周する。ソースは同時実行せず順番に処理する（同時に叩くと検知されやすい）。
 */
export async function runCollectionCycle(): Promise<CollectionCycleResult> {
  const all = getRunnableCollectionSources();
  // 1収集元あたり最大30ページ（1ページごとに3〜8秒空ける）＝約3分かかるため、
  // 全件を1周期で回すと収集ジョブのロック(90分)を超えて途中で切れる。
  // 最終実行が古い順に並んでいるので、上限で切っても次の周期で残りに順番が回る。
  const sources = all.slice(0, MAX_SOURCES_PER_CYCLE);
  const skippedByCap = all.length - sources.length;
  const paused: PausedSourceNotice[] = [];
  let newCompanies = 0;

  if (skippedByCap > 0) {
    logActivity(
      `⏭️ 収集対象${all.length}件のうち${sources.length}件を今回巡回します（残り${skippedByCap}件は次回以降）`,
      "info"
    );
  }

  for (const [index, source] of sources.entries()) {
    if (index > 0) await sleep(nextRequestDelay());

    const outcome = await runSource(source);
    newCompanies += outcome.newCount;
    if (outcome.pausedReason) {
      paused.push({ keyword: source.keyword, reason: outcome.pausedReason });
    }
  }

  return { ranSources: sources.length, newCompanies, paused, skippedByCap };
}
