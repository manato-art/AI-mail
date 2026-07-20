import * as cheerio from "cheerio";

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

async function fetchListingPage(page: number): Promise<string | null> {
  const url = `${WANTEDLY_BASE}${LISTING_PATH}?new=true&page=${page}&order=mixed`;
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

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
