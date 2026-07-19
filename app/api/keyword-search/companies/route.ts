import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { extractCompanies, googleSearch, type GoogleSearchItem } from "@/lib/keyword-search";

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

    const apiKey = getSetting("google_search_api_key");
    const engineId = getSetting("google_search_engine_id");
    if (!apiKey || !engineId) {
      return NextResponse.json(
        { error: "Google検索APIが未設定です。設定ページからAPIキーと検索エンジンIDを登録してください" },
        { status: 400 }
      );
    }

    const query = `site:${site} ${keyword}`;
    const items: GoogleSearchItem[] = [];

    for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
      const pageItems = await googleSearch(apiKey, engineId, query, page * 10 + 1);
      items.push(...pageItems);
      if (pageItems.length < 10) break;
      if (items.length >= maxCount * 2) break;
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
