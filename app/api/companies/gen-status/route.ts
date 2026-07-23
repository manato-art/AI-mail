import { NextResponse } from "next/server";
import { getSendCountsByDomain, getDistinctProspectDomains } from "@/lib/db";
import { normGenDomain } from "@/lib/gen-status";

/**
 * 生成ページの「生成状態」フィルタ用に、ドメイン単位の状態集合を返す。
 * - sentDomains: 一度でも送信済みのドメイン（send_log 由来。単送信・一括・生成送信すべて含む）
 * - generatedDomains: prospect を生成済みのドメイン（送信済みも含むが、分類側で送信済みを優先する）
 *
 * クライアントの classifyGenStatus と**同じ** normGenDomain で正規化しておくことが必須。
 * 片側だけ正規化すると company.domain と一致せず誤分類する。
 * 企業の分類（送信済み / 生成済み・未送信 / 未生成）はクライアントで domain 突き合わせて行う。
 */
export async function GET() {
  const sent = getSendCountsByDomain();
  const generated = getDistinctProspectDomains();
  return NextResponse.json({
    sentDomains: Object.keys(sent).map(normGenDomain),
    generatedDomains: generated.map(normGenDomain),
  });
}
