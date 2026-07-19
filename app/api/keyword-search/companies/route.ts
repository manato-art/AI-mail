import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { extractCompanies, webSearch, type SearchResultItem } from "@/lib/keyword-search";
import { scrapeSearch } from "@/lib/keyword-search-scrape";

const MAX_COMPANIES = 50;
const MAX_SEARCH_PAGES = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
    const site = typeof body?.site === "string"
      ? body.site.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      : "";
    const maxCount = Math.min(Math.max(Number(body?.maxCount) || 20, 1), MAX_COMPANIES);

    if (!keyword || !site) {
      return NextResponse.json({ error: "キーワードと検索元サイトを指定してください" }, { status: 400 });
    }

    const mode = getSetting("search_mode") || "api";
    const query = `site:${site} ${keyword}`;
    const items: SearchResultItem[] = [];

    if (mode === "scrape") {
      const scraped = await scrapeSearch(query);
      items.push(...scraped);
    } else {
      const apiKey = getSetting("serper_api_key") || process.env.SERPER_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "検索APIが未設定です。設定ページからAPIキーを登録するか、スクレイピングモードに切り替えてください" },
          { status: 400 }
        );
      }
      for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
        const pageItems = await webSearch(apiKey, query, page);
        items.push(...pageItems);
        if (pageItems.length < 10) break;
        if (items.length >= maxCount * 2) break;
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ companies: [], fallbackContact: "ご担当者様" });
    }

    const extraction = await extractCompanies(keyword, site, items, maxCount);
    return NextResponse.json(extraction);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "企業リストの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
