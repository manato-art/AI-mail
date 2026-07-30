import { NextRequest, NextResponse } from "next/server";
import { mergeDuplicateUrlSources } from "@/lib/db";

/**
 * 同じ検索（URLの page= 違い）で重複登録された収集元を1件にまとめる。
 *
 * GET  … 何件消えるかだけ返す（下見。データは触らない）
 * POST … 実行。誤爆を防ぐため合言葉 confirm を必須にする
 *
 * 集めた企業データは消えない。消えるのは重複していた収集元の行と巡回履歴だけ。
 */
const CONFIRMATION = "MERGE_DUPLICATE_SOURCES";

export function GET() {
  const preview = mergeDuplicateUrlSources(true);
  return NextResponse.json({
    groups: preview.groups,
    willRemove: preview.removed,
    keep: preview.kept.map((k) => ({ id: k.id, url: k.url, removes: k.removedIds.length })),
  });
}

export async function POST(request: NextRequest) {
  let confirmation: unknown;
  try {
    confirmation = (await request.json())?.confirm;
  } catch {
    confirmation = undefined;
  }
  if (confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: "確認キーが一致しないため中止しました" }, { status: 400 });
  }

  try {
    const result = mergeDuplicateUrlSources(false);
    return NextResponse.json({
      ok: true,
      groups: result.groups,
      removed: result.removed,
      keep: result.kept.map((k) => ({ id: k.id, url: k.url, removes: k.removedIds.length })),
    });
  } catch (error) {
    console.error("[merge-duplicates]", error);
    return NextResponse.json({ error: "重複のまとめに失敗しました" }, { status: 500 });
  }
}
