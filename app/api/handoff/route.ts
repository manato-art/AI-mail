import { NextRequest, NextResponse } from "next/server";
import { importStorePack, type StorePack } from "@/lib/handoff";

/**
 * 店パック取込（かってにHP・継ぎ目②）。
 * proxy.ts の認証の内側でのみ到達できる（PUBLIC_PATHS に載せないこと）。
 * 本体は lib/handoff.ts（検証スクリプトと共有するため分離）。
 */
const MAX_PACKS = 100;

export async function POST(request: NextRequest) {
  let body: { packs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const packs = Array.isArray(body.packs) ? (body.packs as StorePack[]) : [];
  if (packs.length === 0) {
    return NextResponse.json({ error: "packs が空です" }, { status: 400 });
  }
  if (packs.length > MAX_PACKS) {
    return NextResponse.json(
      { error: `一度に取り込めるのは ${MAX_PACKS} 件までです` },
      { status: 400 }
    );
  }

  const results = packs.map((p) => importStorePack(p));
  const summary = {
    imported: results.filter((r) => r.outcome === "imported").length,
    suppressed: results.filter((r) => r.outcome === "suppressed").length,
    invalid: results.filter((r) => r.outcome === "invalid").length,
    conflict: results.filter((r) => r.outcome === "conflict").length,
  };

  // 1件でも入らなかったら 207。まとめて 200 を返すと「入ったつもり」で送ってしまう
  const allOk = summary.invalid === 0 && summary.conflict === 0;
  return NextResponse.json({ summary, results }, { status: allOk ? 200 : 207 });
}
