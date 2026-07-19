import * as cheerio from "cheerio";
import { BLOCKED_STATUSES, SearchBlockedError } from "@/lib/keyword-search";
import type { SearchResultItem } from "@/lib/keyword-search";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function extractRealUrl(ddgHref: string): string | null {
  try {
    const match = ddgHref.match(/[?&]uddg=([^&]+)/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    if (decoded.includes("bing.com/aclick")) return null;
    new URL(decoded);
    return decoded;
  } catch {
    return null;
  }
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function scrapeSearch(
  query: string,
): Promise<SearchResultItem[]> {
  const res = await fetch(DDG_HTML_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query, kl: "jp-jp" }).toString(),
  });

  if (!res.ok) {
    // 403/429/503 は「叩き過ぎ・拒否」。常時収集側が即停止できるよう型で区別する
    if (BLOCKED_STATUSES.has(res.status)) {
      throw new SearchBlockedError(
        `検索元からアクセスを拒否されました（${res.status}）`,
        res.status
      );
    }
    throw new Error(`検索スクレイピングに失敗しました（${res.status}）`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const items: SearchResultItem[] = [];

  $(".result").each((_, el) => {
    const linkEl = $(el).find(".result__a");
    const snippetEl = $(el).find(".result__snippet");

    const href = linkEl.attr("href") || "";
    const realUrl = extractRealUrl(href);
    if (!realUrl) return;

    items.push({
      title: linkEl.text().trim(),
      link: realUrl,
      snippet: snippetEl.text().trim(),
      displayLink: domainFromUrl(realUrl),
    });
  });

  return items;
}
