import * as cheerio from "cheerio";
import { SearchBlockedError, BLOCKED_STATUSES } from "@/lib/keyword-search";

const WANTEDLY_BASE = "https://www.wantedly.com";
const LISTING_PATH = "/projects";
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGES_PER_RUN = 2;
const MAX_PAGE = 20;

const REQUEST_DELAY_BASE_MS = 3000;
const REQUEST_DELAY_JITTER_MS = 5000;

export interface WantedlyListing {
  companyName: string;
  listingUrl: string;
  listingTitle: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(): number {
  return REQUEST_DELAY_BASE_MS + Math.floor(Math.random() * REQUEST_DELAY_JITTER_MS);
}

/** wantedly.com（サブドメイン含む）のHTTPS/HTTP URLだけを許可する（SSRF対策） */
export function isWantedlyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host === "wantedly.com" || host.endsWith(".wantedly.com");
  } catch {
    return false;
  }
}

/** ベースURLの page クエリを差し替えてページ送りURLを作る */
function buildPagedUrl(baseUrl: string, page: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set("page", String(page));
  return u.toString();
}

async function fetchHtmlPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.8",
      },
    });

    // 叩き過ぎ・拒否（403/429/503）は「新着0件」と区別し、即座に停止させる。
    // null で返すと空ページ扱いになり、遅い枯渇判定でしか止まらず状況が悪化する。
    if (BLOCKED_STATUSES.has(res.status)) {
      throw new SearchBlockedError(
        `Wantedlyからアクセスを拒否されました（${res.status}）`,
        res.status
      );
    }

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    return await res.text();
  } catch (error) {
    // ブロックは呼び出し元（collection.ts）の即停止パスに伝播させる。
    // その他のネットワークエラー・タイムアウトは従来通り空ページ扱い。
    if (error instanceof SearchBlockedError) throw error;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** 新着フィード（?new=true&order=mixed）の指定ページを取得する */
function fetchListingPage(page: number): Promise<string | null> {
  return fetchHtmlPage(`${WANTEDLY_BASE}${LISTING_PATH}?new=true&page=${page}&order=mixed`);
}

/**
 * Wantedly一覧ページのHTMLから企業名・掲載URL・募集タイトルを抽出する。
 *
 * セレクタはstyled-components由来のクラス名に依存する。
 * クラス名のハッシュ部分は変わりうるので、安定している部分文字列で絞る。
 */
export function parseListings(html: string): WantedlyListing[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: WantedlyListing[] = [];

  // 各プロジェクトカードは "projects-index-single" クラスを持つ要素
  $('[class*="projects-index-single"]').each((_, el) => {
    const $card = $(el);

    // 掲載URL: カード内の /projects/{id} リンク
    const projectLink = $card.find('a[href^="/projects/"]').first();
    const href = projectLink.attr("href");
    if (!href) return;

    const listingUrl = `${WANTEDLY_BASE}${href}`;

    // 同じ掲載を重複して取らない（レスポンシブ用に同じカードが複数出る場合がある）
    if (seen.has(href)) return;
    seen.add(href);

    // 募集タイトル: TitleText を含むクラスの要素
    const titleEl = $card.find('[class*="TitleText"]').first();
    const listingTitle = titleEl.text().trim();

    // 企業名: CompanyNameText を含むクラスの要素
    const companyEl = $card.find('[class*="CompanyNameText"]').first();
    const companyName = companyEl.text().trim();

    if (!companyName) return;

    results.push({ companyName, listingUrl, listingTitle });
  });

  return results;
}

export interface WantedlyFetchResult {
  listings: WantedlyListing[];
  nextPage: number;
  /** 取得自体が0件だったページ数 */
  emptyPages: number;
}

/**
 * Wantedlyの一覧ページを複数ページ巡回し、企業情報を収集する。
 * 同時実行は1、ページ間は数秒のランダムディレイを入れる。
 */
export async function fetchWantedlyListings(
  startPage: number
): Promise<WantedlyFetchResult> {
  const allListings: WantedlyListing[] = [];
  let page = startPage;
  let emptyPages = 0;

  for (let i = 0; i < PAGES_PER_RUN; i++) {
    if (i > 0) await sleep(nextDelay());

    const html = await fetchListingPage(page);
    if (!html) {
      emptyPages += 1;
      page += 1;
      continue;
    }

    const listings = parseListings(html);
    if (listings.length === 0) {
      emptyPages += 1;
      page += 1;
      if (page > MAX_PAGE) break;
      continue;
    }

    allListings.push(...listings);
    page += 1;

    if (page > MAX_PAGE) break;
  }

  return {
    listings: allListings,
    nextPage: page > MAX_PAGE ? 1 : page,
    emptyPages,
  };
}

/**
 * 貼り付けられた Wantedly 検索/一覧URLを、page を進めながら巡回して企業を収集する。
 * wantedly.com 以外のURLは弾く（SSRF対策）。一覧ページと同じカード構造なので parseListings で抽出できる。
 */
export async function fetchWantedlyListingsFromUrl(
  baseUrl: string,
  startPage: number
): Promise<WantedlyFetchResult> {
  if (!isWantedlyUrl(baseUrl)) {
    // 呼び出し側は listings=0 で「収集元が無効」を検知できる
    return { listings: [], nextPage: 1, emptyPages: PAGES_PER_RUN };
  }

  const allListings: WantedlyListing[] = [];
  const seen = new Set<string>();
  let page = startPage;
  let emptyPages = 0;

  for (let i = 0; i < PAGES_PER_RUN; i++) {
    if (i > 0) await sleep(nextDelay());

    const html = await fetchHtmlPage(buildPagedUrl(baseUrl, page));
    if (!html) {
      emptyPages += 1;
      page += 1;
      continue;
    }

    const listings = parseListings(html).filter((l) => {
      if (seen.has(l.listingUrl)) return false;
      seen.add(l.listingUrl);
      return true;
    });
    if (listings.length === 0) {
      emptyPages += 1;
      page += 1;
      if (page > MAX_PAGE) break;
      continue;
    }

    allListings.push(...listings);
    page += 1;
    if (page > MAX_PAGE) break;
  }

  return {
    listings: allListings,
    nextPage: page > MAX_PAGE ? 1 : page,
    emptyPages,
  };
}
