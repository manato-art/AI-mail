import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";

export interface EightContact {
  id: string;
  company_name: string;
  person_name: string;
  email: string;
  department: string;
  position: string;
}

export async function GET(request: NextRequest) {
  const apiKey = getSetting("eight_api_key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Eight APIキーが設定されていません" },
      { status: 400 }
    );
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "50");

  // TODO: Eight API 実装（APIキー受領後に差し替え）
  // const res = await fetch(`https://api.8card.net/v1/contacts?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`, {
  //   headers: { Authorization: `Bearer ${apiKey}` },
  // });

  void query;
  void page;
  void perPage;

  return NextResponse.json({
    contacts: [] as EightContact[],
    total: 0,
    page,
    per_page: perPage,
    message: "Eight API未接続（APIキー受領後に実装）",
  });
}
