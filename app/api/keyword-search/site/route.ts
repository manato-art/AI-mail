import { NextRequest, NextResponse } from "next/server";
import { decideSearchSite } from "@/lib/keyword-search";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";

    if (!keyword) {
      return NextResponse.json({ error: "キーワードを入力してください" }, { status: 400 });
    }

    const decision = await decideSearchSite(keyword);
    return NextResponse.json(decision);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "検索元サイトの判断に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
