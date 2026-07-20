import { NextRequest, NextResponse } from "next/server";
import {
  createCollectionSource,
  getAllCollectionSources,
  getRecentCollectionRuns,
} from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    sources: getAllCollectionSources(),
    runs: getRecentCollectionRuns(),
  });
}

export async function POST(request: NextRequest) {
  let body: { keyword?: string; site?: string; source_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const sourceType = body.source_type === "wantedly_direct" ? "wantedly_direct" as const : "keyword_search" as const;

  if (sourceType === "wantedly_direct") {
    const label = "Wantedly 新着";
    return NextResponse.json({
      source: createCollectionSource(label, "wantedly.com", sourceType),
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

  return NextResponse.json({ source: createCollectionSource(keyword, site, sourceType) });
}
