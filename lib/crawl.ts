import * as cheerio from "cheerio";
import type { CrawlPage, CrawlResult, CrawlResultWithRefusal } from "@/lib/types";
import { validateUrlWithDns } from "@/lib/ssrf";

const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGES = 5;
const MAX_TEXT_LENGTH = 5000;
const CRAWL_DELAY_BASE_MS = 800;
const CRAWL_DELAY_JITTER_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextCrawlDelay(): number {
  return CRAWL_DELAY_BASE_MS + Math.floor(Math.random() * CRAWL_DELAY_JITTER_MS);
}
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface LinkCategory {
  keywords: string[];
}

const LINK_CATEGORIES: LinkCategory[] = [
  { keywords: ["お問い合わせ", "お問合せ", "問い合わせ", "問合せ", "contact", "inquiry", "toiawase"] },
  { keywords: ["会社概要", "about", "company", "corporate"] },
  { keywords: ["特定商取引", "tokushoho", "law", "legal", "特商法"] },
  { keywords: ["プライバシー", "個人情報", "privacy"] },
  { keywords: ["アクセス", "access", "所在地", "拠点"] },
  { keywords: ["サービス", "事業内容", "service", "business"] },
  { keywords: ["ニュース", "お知らせ", "news", "topics"] },
];

const CONTACT_KEYWORDS = ["お問い合わせ", "お問合せ", "問い合わせ", "contact", "inquiry"];

/**
 * F1 採用シグナル検出。相手企業自身のHPを見る行為なので媒体規約と無関係。
 * 採用ページの有無は「いま採用に動いているか」の判断材料になる。
 */
const RECRUIT_KEYWORDS = [
  "採用",
  "求人",
  "インターン",
  "新卒",
  "中途",
  "recruit",
  "career",
  "join-us",
  "hiring",
  "intern",
];

/** クロール済みHTMLから採用ページのURLを1つ返す。無ければ null */
export function detectRecruitPageUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href");
    if (!href) continue;

    const label = `${$(el).text()} ${href}`.toLowerCase();
    if (!RECRUIT_KEYWORDS.some((kw) => label.includes(kw))) continue;

    try {
      const resolved = new URL(href, base);
      // 外部の求人媒体（wantedly等）ではなく自社サイト内のページだけを対象にする
      if (resolved.hostname !== base.hostname) continue;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      return resolved.toString();
    } catch {
      continue;
    }
  }
  return null;
}

const REFUSAL_KEYWORDS = [
  "営業お断り",
  "営業メールお断り",
  "営業のご連絡はお断り",
  "セールスお断り",
  "営業目的のメールはご遠慮",
  "営業目的のお問い合わせはご遠慮",
  "営業・勧誘はお断り",
  "売り込みお断り",
  "営業についてはお断り",
];

interface FetchedPage {
  html: string;
  finalUrl: string;
}

/** リダイレクト追従の上限。無制限だとループに嵌る */
const MAX_REDIRECTS = 5;

async function fetchPage(url: string): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // redirect:"follow" だと入口の validateUrl を回避して内部ホストへ到達できてしまうため、
    // 手動で追従し、毎ホップ SSRF 検証をかけ直す。
    // 文字列検証だけでは「公開ドメイン→内部IP」を防げないため DNS 解決まで検証する。
    const entry = await validateUrlWithDns(url);
    if (!entry.valid) return null;
    let currentUrl = entry.normalized;
    let res: Response;

    for (let hop = 0; ; hop++) {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en;q=0.8",
        },
      });

      if (res.status < 300 || res.status >= 400) break;

      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) return null;

      const next = new URL(location, currentUrl).toString();
      const validated = await validateUrlWithDns(next);
      if (!validated.valid) return null;
      currentUrl = validated.normalized;
    }

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return null;
    }

    const html = await res.text();
    return { html, finalUrl: res.url || currentUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * ブロック要素・改行要素の境目に空白を入れてからテキスト化する。
 *
 * cheerio の .text() は要素間を無区切りで連結するため、
 * `<a>privacy@example.co.jp</a><nav>TOP…` が `privacy@example.co.jpTOP…` になり、
 * `privacy@example.co.jptop` という実在しないアドレスとして抽出されてしまう。
 * 破損アドレスをそのまま宛先に使うとバウンスし、送信ドメインの評価まで落とす。
 */
const BLOCK_LEVEL_SELECTOR =
  "address,article,aside,blockquote,br,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,td,th,tr,ul";

function separateBlocks($: cheerio.CheerioAPI): void {
  $(BLOCK_LEVEL_SELECTOR).each((_, el) => {
    $(el).before(" ").after(" ");
  });
}

export function extractText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  separateBlocks($);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_TEXT_LENGTH);
}

/** footer/header を含む全テキストからメアドを拾う。extractText は分析用に除去するが、メアド抽出では必要 */
export function extractFullBodyText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  separateBlocks($);
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function extractTitle(html: string): string {
  const $ = cheerio.load(html);
  return $("title").first().text().trim();
}

export function findPriorityLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);

  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const seen = new Set<string>([base.href]);
  const results: string[] = [];

  for (const category of LINK_CATEGORIES) {
    let matchedUrl: string | null = null;

    $("a[href]").each((_, el) => {
      if (matchedUrl) {
        return;
      }

      const href = $(el).attr("href");
      if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href.trim())) {
        return;
      }

      let resolved: URL;
      try {
        resolved = new URL(href, baseUrl);
      } catch {
        return;
      }

      if (resolved.origin !== base.origin) {
        return;
      }
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        return;
      }

      const normalized = `${resolved.origin}${resolved.pathname}${resolved.search}`;
      if (seen.has(normalized)) {
        return;
      }

      const linkText = $(el).text().trim().toLowerCase();
      const hrefLower = href.toLowerCase();

      const isMatch = category.keywords.some(
        (keyword) =>
          linkText.includes(keyword.toLowerCase()) || hrefLower.includes(keyword.toLowerCase())
      );

      if (isMatch) {
        matchedUrl = normalized;
      }
    });

    if (matchedUrl) {
      results.push(matchedUrl);
      seen.add(matchedUrl);
    }
  }

  return results;
}

/**
 * メールアドレスのTLDにはなり得ない、画像・アセット系のファイル拡張子。
 * 「logo@2x.png」「sprite@2x.jpg」等の画像ファイル名を誤ってメアドと拾うのを防ぐ。
 */
const ASSET_TLD_BLOCKLIST = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "avif", "tiff",
  "css", "js", "mjs", "cjs", "json", "map", "ts",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp4", "webm", "mov", "avi", "wmv", "mkv",
  "mp3", "wav", "ogg", "flac",
  "pdf", "zip", "gz",
  "2x", "3x",
]);

/**
 * 3文字以上の既知TLD。2文字のTLD（ccTLD）は網羅できないので長さで許可する。
 *
 * これが無いと `privacy@example.co.jp` の直後に別要素のテキストがくっついた
 * `privacy@example.co.jptop` のような破損アドレスを「英字だけのTLD」として通してしまう。
 * 未知のTLDを落とす方向に倒すのは意図的（誤って送るより、拾い損ねる方が安全）。
 */
const KNOWN_TLDS = new Set([
  // 主要gTLD
  "com", "net", "org", "int", "edu", "gov", "mil", "biz", "info", "name", "pro", "mobi",
  "asia", "tel", "xxx", "coop", "aero", "jobs", "museum", "travel", "post", "cat",
  // 新gTLD（日本の企業サイトで実際に使われる範囲）
  "app", "dev", "page", "site", "online", "store", "shop", "tech", "cloud", "digital",
  "systems", "solutions", "services", "network", "company", "group", "inc", "ltd", "llc",
  "agency", "consulting", "marketing", "design", "studio", "media", "works", "world",
  "center", "expert", "partners", "associates", "capital", "finance", "fund", "estate",
  "homes", "house", "build", "construction", "energy", "farm", "food", "cafe", "bar",
  "restaurant", "fashion", "style", "beauty", "fitness", "sport", "travel", "tours",
  "hotel", "taxi", "delivery", "express", "global", "life", "live", "club", "blog",
  "email", "link", "one", "space", "team", "today", "tokyo", "osaka", "nagoya", "yokohama",
  "kyoto", "okinawa", "work", "care", "clinic", "dental", "health", "law", "legal",
  "academy", "school", "education", "science", "engineering", "computer", "software",
  "support", "training", "management", "industries", "holdings", "ventures", "trade",
  "market", "shopping", "bank", "insurance", "realty", "property", "rentals", "auto",
  "cars", "bike", "toys", "games", "art", "photo", "photography", "music", "video",
  "news", "press", "info", "guide", "wiki", "zone", "plus", "top", "vip", "xyz", "site",
]);

/**
 * 抽出した文字列が「本物のメールアドレスらしいか」を判定する。
 * TLD が画像等のアセット拡張子だったり、既知TLDでない場合は誤抽出とみなす。
 */
export function isPlausibleEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  const tld = (domain.split(".").pop() ?? "").toLowerCase();
  if (ASSET_TLD_BLOCKLIST.has(tld)) return false;
  // 実在するTLDに24文字を超えるものは無い。極端に長いものは連結事故とみなす
  if (tld.length > 24) return false;
  // 実在するメールのTLDは英字のみ（png/2x のような数字混じり・拡張子は弾く）
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;
  // 2文字はccTLD（jp/us/uk…）として許可。3文字以上は既知TLDだけ通す
  return tld.length === 2 || KNOWN_TLDS.has(tld);
}

export function extractEmails(text: string): string[] {
  const normalized = text
    .replace(/＠/g, "@")
    .replace(/\s*[（(]\s*at\s*[)）]\s*/gi, "@")
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*★\s*/g, "@")
    .replace(/\s*☆\s*/g, "@")
    .replace(/\s*●\s*/g, "@")
    .replace(/\s*◆\s*/g, "@")
    .replace(/\s*■\s*/g, "@")
    .replace(/\s*\{at\}\s*/gi, "@")
    .replace(/\s*<at>\s*/gi, "@")
    .replace(/\s*_at_\s*/gi, "@")
    .replace(/\s*\(a\)\s*/gi, "@")
    .replace(/（ドット）/g, ".")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".");

  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+/g;
  const matches = normalized.match(pattern) || [];

  const emails = new Set<string>();
  for (const match of matches) {
    const email = match.toLowerCase().replace(/\.+$/, "");
    if (isPlausibleEmail(email)) emails.add(email);
  }

  return Array.from(emails);
}

/** JSON-LD構造化データからメールアドレスを抽出する */
function extractEmailsFromJsonLd(html: string): string[] {
  const $ = cheerio.load(html);
  const emails: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const data = JSON.parse(raw);
      collectEmailsFromObject(data, emails);
    } catch { /* malformed JSON-LD */ }
  });

  return emails;
}

function collectEmailsFromObject(obj: unknown, out: string[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectEmailsFromObject(item, out);
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if ((key === "email" || key === "contactPoint") && typeof value === "string" && value.includes("@")) {
      out.push(value.replace(/^mailto:/i, "").toLowerCase());
    } else if (typeof value === "object") {
      collectEmailsFromObject(value, out);
    }
  }
}

/** metaタグやHTML属性に埋まったメールアドレスを抽出する */
function extractEmailsFromAttributes(html: string): string[] {
  const $ = cheerio.load(html);
  const emails: string[] = [];
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  $("meta[content]").each((_, el) => {
    const content = $(el).attr("content") || "";
    const matches = content.match(emailPattern);
    if (matches) emails.push(...matches);
  });

  $("[data-email], [data-mail], [data-mailto]").each((_, el) => {
    for (const attr of ["data-email", "data-mail", "data-mailto"]) {
      const val = $(el).attr(attr) || "";
      if (val.includes("@")) emails.push(val);
    }
  });

  return emails.map((e) => e.toLowerCase());
}

function extractMailtoEmails(html: string): string[] {
  const $ = cheerio.load(html);
  const emails: string[] = [];

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) {
      return;
    }
    const address = href.replace(/^mailto:/i, "").split("?")[0].trim();
    if (address) {
      emails.push(address.toLowerCase());
    }
  });

  return emails;
}

/**
 * フォームとして扱ってはいけない配布ファイル。
 * 「お問い合わせ」リンクがPDFの申込用紙を指していることがあり、
 * それを form_url として保存すると「連絡可能」の件数が実態より水増しされる。
 */
const NON_FORM_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".rar", ".csv", ".txt", ".jpg", ".jpeg", ".png", ".gif",
];

/** リンク先がフォームではなく配布ファイル（PDF等）か */
export function isNonFormDocumentUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url, "https://example.com").pathname.toLowerCase();
  } catch {
    pathname = url.toLowerCase().split("?")[0].split("#")[0];
  }
  return NON_FORM_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

export function detectFormUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);

  if ($("form").length > 0) {
    return baseUrl;
  }

  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  let contactUrl: string | null = null;

  $("a[href]").each((_, el) => {
    if (contactUrl) {
      return;
    }

    const href = $(el).attr("href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href.trim())) {
      return;
    }

    const linkText = $(el).text().trim().toLowerCase();
    const hrefLower = href.toLowerCase();
    const isContactLink = CONTACT_KEYWORDS.some(
      (keyword) => linkText.includes(keyword.toLowerCase()) || hrefLower.includes(keyword.toLowerCase())
    );

    if (!isContactLink) {
      return;
    }

    // PDF等の配布ファイルは「フォーム」ではない。保存すると連絡可能件数を水増しする
    if (isNonFormDocumentUrl(href)) {
      return;
    }

    try {
      const resolved = new URL(href, baseUrl);
      if (
        resolved.origin === base.origin &&
        (resolved.protocol === "http:" || resolved.protocol === "https:")
      ) {
        contactUrl = resolved.href;
      }
    } catch {
      return;
    }
  });

  return contactUrl;
}

export function detectRefusal(texts: string[]): { hasRefusal: boolean; refusalText: string | null } {
  for (const text of texts) {
    for (const keyword of REFUSAL_KEYWORDS) {
      const idx = text.indexOf(keyword);
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + keyword.length + 40);
        return {
          hasRefusal: true,
          refusalText: text.slice(start, end).replace(/\s+/g, " ").trim(),
        };
      }
    }
  }
  return { hasRefusal: false, refusalText: null };
}

export async function crawlWebsiteWithRefusal(url: string): Promise<CrawlResultWithRefusal> {
  const result = await crawlWebsite(url);
  const texts = result.pages.map((p) => p.text);
  const refusal = detectRefusal(texts);
  return { ...result, ...refusal };
}

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const pages: CrawlPage[] = [];
  const emailSet = new Set<string>();
  let formUrl: string | null = null;

  const rootFetch = await fetchPage(url);

  if (!rootFetch) {
    return { url, pages: [], contactEmails: [], formUrl: null, recruitPageUrl: null };
  }

  const rootPage: CrawlPage = {
    url: rootFetch.finalUrl,
    title: extractTitle(rootFetch.html),
    text: extractText(rootFetch.html),
  };
  pages.push(rootPage);

  extractMailtoEmails(rootFetch.html).forEach((email) => emailSet.add(email));
  extractEmails(extractFullBodyText(rootFetch.html)).forEach((email) => emailSet.add(email));
  extractEmailsFromJsonLd(rootFetch.html).forEach((email) => emailSet.add(email));
  extractEmailsFromAttributes(rootFetch.html).forEach((email) => emailSet.add(email));

  const rootFormUrl = detectFormUrl(rootFetch.html, rootFetch.finalUrl);
  if (rootFormUrl) {
    formUrl = rootFormUrl;
  }

  // F1: 採用シグナル。トップページのリンクから採用ページを探す
  const recruitPageUrl = detectRecruitPageUrl(rootFetch.html, rootFetch.finalUrl);

  const priorityLinks = findPriorityLinks(rootFetch.html, rootFetch.finalUrl).filter(
    (link) => link !== rootFetch.finalUrl
  );

  for (const [i, link] of priorityLinks.slice(0, MAX_PAGES - 1).entries()) {
    if (i > 0) await sleep(nextCrawlDelay());
    const fetched = await fetchPage(link);
    if (!fetched) {
      continue;
    }

    const page: CrawlPage = {
      url: fetched.finalUrl,
      title: extractTitle(fetched.html),
      text: extractText(fetched.html),
    };
    pages.push(page);

    extractMailtoEmails(fetched.html).forEach((email) => emailSet.add(email));
    extractEmails(extractFullBodyText(fetched.html)).forEach((email) => emailSet.add(email));
    extractEmailsFromJsonLd(fetched.html).forEach((email) => emailSet.add(email));
    extractEmailsFromAttributes(fetched.html).forEach((email) => emailSet.add(email));

    if (!formUrl) {
      const linkFormUrl = detectFormUrl(fetched.html, fetched.finalUrl);
      if (linkFormUrl) {
        formUrl = linkFormUrl;
      }
    }
  }

  return {
    url,
    pages,
    // mailto/JSON-LD/属性由来も含め、画像ファイル名等の誤抽出を最終的に落とす
    contactEmails: Array.from(emailSet).filter(isPlausibleEmail),
    formUrl,
    recruitPageUrl,
  };
}
