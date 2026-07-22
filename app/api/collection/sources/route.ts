import { NextRequest, NextResponse } from "next/server";
import {
  createCollectionSource,
  createWantedlyUrlSource,
  getAllCollectionSources,
  getRecentCollectionRuns,
} from "@/lib/db";
import { isWantedlyUrl } from "@/lib/wantedly-scraper";

export async function GET() {
  return NextResponse.json({
    sources: getAllCollectionSources(),
    runs: getRecentCollectionRuns(),
  });
}

export async function POST(request: NextRequest) {
  let body: { keyword?: string; site?: string; source_type?: string; url?: string; service_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  // F1: このキーワードをどの商材向けに集めるか（任意）
  const serviceId =
    typeof body.service_id === "number" && Number.isInteger(body.service_id) ? body.service_id : null;

  // 貼り付けられたWantedly検索URLからの収集ソース
  if (body.source_type === "wantedly_url") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "URLを入力してください" }, { status: 400 });
    }
    if (!isWantedlyUrl(url)) {
      return NextResponse.json(
        { error: "現在は Wantedly（wantedly.com）のURLのみ対応しています" },
        { status: 400 }
      );
    }
    return NextResponse.json({ source: createWantedlyUrlSource(url, serviceId) });
  }

  const sourceType = body.source_type === "wantedly_direct" ? "wantedly_direct" as const : "keyword_search" as const;

  if (sourceType === "wantedly_direct") {
    const label = "Wantedly 新着";
    return NextResponse.json({
      source: createCollectionSource(label, "wantedly.com", sourceType, serviceId),
    });
  }

  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const site =
    typeof body.site === "string"
      ? body.site.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      : "";

  if (!keyword) {
    return NextResponse.json({ error: "キーワードを入力してください" }, { status: 400 });
  }

  return NextResponse.json({ source: createCollectionSource(keyword, site, sourceType, serviceId) });
}
