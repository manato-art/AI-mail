import * as cheerio from "cheerio";
import type { CrawlPage, CrawlResult } from "@/lib/types";

const FETCH_TIMEOUT_MS = 10000;
const MAX_PAGES = 5;
const MAX_TEXT_LENGTH = 10000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface LinkCategory {
  keywords: string[];
}

const LINK_CATEGORIES: LinkCategory[] = [
  { keywords: ["会社概要", "about", "company"] },
  { keywords: ["サービス", "事業内容", "service", "business"] },
  { keywords: ["お問い合わせ", "contact"] },
  { keywords: ["ニュース", "お知らせ", "news", "topics"] },
];

const CONTACT_KEYWORDS = ["お問い合わせ", "contact"];

interface FetchedPage {
  html: string;
  finalUrl: string;
}

async function fetchPage(url: string): Promise<FetchedPage | null> {
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
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_TEXT_LENGTH);
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

export function extractEmails(text: string): string[] {
  const normalized = text
    .replace(/＠/g, "@")
    .replace(/\s*[（(]\s*at\s*[)）]\s*/gi, "@")
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@");

  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+/g;
  const matches = normalized.match(pattern) || [];

  const emails = new Set<string>();
  for (const match of matches) {
    emails.add(match.toLowerCase().replace(/\.+$/, ""));
  }

  return Array.from(emails);
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

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const pages: CrawlPage[] = [];
  const emailSet = new Set<string>();
  let formUrl: string | null = null;

  const rootFetch = await fetchPage(url);

  if (!rootFetch) {
    return { url, pages: [], contactEmails: [], formUrl: null };
  }

  const rootPage: CrawlPage = {
    url: rootFetch.finalUrl,
    title: extractTitle(rootFetch.html),
    text: extractText(rootFetch.html),
  };
  pages.push(rootPage);

  extractMailtoEmails(rootFetch.html).forEach((email) => emailSet.add(email));
  extractEmails(rootPage.text).forEach((email) => emailSet.add(email));

  const rootFormUrl = detectFormUrl(rootFetch.html, rootFetch.finalUrl);
  if (rootFormUrl) {
    formUrl = rootFormUrl;
  }

  const priorityLinks = findPriorityLinks(rootFetch.html, rootFetch.finalUrl).filter(
    (link) => link !== rootFetch.finalUrl
  );

  for (const link of priorityLinks.slice(0, MAX_PAGES - 1)) {
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
    extractEmails(page.text).forEach((email) => emailSet.add(email));

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
    contactEmails: Array.from(emailSet),
    formUrl,
  };
}
