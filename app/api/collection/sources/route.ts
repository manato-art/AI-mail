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
  let body: { keyword?: string; site?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  // 空にしておくと初回実行時にAIが検索元サイトを決める
  const site =
    typeof body.site === "string"
      ? body.site.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      : "";

  if (!keyword) {
    return NextResponse.json({ error: "キーワードを入力してください" }, { status: 400 });
  }

  return NextResponse.json({ source: createCollectionSource(keyword, site) });
}
