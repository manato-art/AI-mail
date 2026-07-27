/**
 * 調査バッチの回路遮断（サーキットブレーカー）の検証。
 *
 * 検索が壊れているのは「その企業の事情」ではなく「こちらの基盤の障害」。
 * 気づかずに回し続けると、5分おきに20社ずつ機械的に「調査できず」を量産する
 * （本番で487社中238社が失敗扱いになった直接の原因）。
 * ここでは次を確認する:
 *   1. 基盤起因（設定不足）を検知したら即打ち切り、残りは pending のまま
 *   2. 打ち切り時に自動見回りが停止し、手動で解除できる
 *   3. 企業固有の失敗でも、同じ理由が3件続いたら打ち切る（単発では止めない）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dnsPromises from "node:dns/promises";

// 本番DBを触らないよう、使い捨てDBに固定してから読み込む
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mail-breaker-"));
process.env.DATABASE_DIR = tmpDir;
// 外部APIには絶対に到達させない（キーが無い状態を意図的に作る）
process.env.SERPER_API_KEY = "";
process.env.GEMINI_API_KEY = "";

const { deleteCompany, upsertCompany, getCompanyById, setSetting } = await import("@/lib/db");
const {
  runEnrichmentBatch,
  getEnrichmentPausedUntil,
  resumeEnrichment,
} = await import("@/lib/enrichment");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

function makeCompanies(prefix: string, count: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(upsertCompany({ name: `${prefix}${i + 1}`, source: "test" }).id);
  }
  return ids;
}

const statusOf = (id: number) => getCompanyById(id)?.enrichment_status;
const kindOf = (id: number) => getCompanyById(id)?.error_kind;

// ============ 1. 基盤起因（検索APIキー未設定）は1社で打ち切る ============
setSetting("search_mode", "api");
setSetting("serper_api_key", "");
resumeEnrichment();

const infraIds = makeCompanies("設定エラー社", 5);
const infraResult = await runEnrichmentBatch(5);

check("基盤起因は1社で打ち切る（20社を焼き切らない）", infraResult.failed === 1);
check("打ち切り理由が config_missing として記録される", kindOf(infraIds[0]) === "config_missing");
check("打ち切り時に残件数を返す（残り4社）", infraResult.stoppedRemaining === 4);
check(
  "残りは pending のまま（復旧後に自動再開できる）",
  infraIds.slice(1).every((id) => statusOf(id) === "pending")
);
check("自動見回りが停止する", getEnrichmentPausedUntil() !== null);

resumeEnrichment();
check("手動リセットで停止を解除できる", getEnrichmentPausedUntil() === null);

// ============ 2. 企業固有の失敗は「同じ理由が3件連続」で打ち切る ============
// 1で残した pending は次のバッチに混ざるので片付けてから始める
for (const id of infraIds) deleteCompany(id);

// 検索は成功させ、クロールだけ失敗させる（＝crawl_empty が続く状況を作る）
setSetting("serper_api_key", "dummy-key-for-test");

const realLookup = dnsPromises.lookup;
(dnsPromises as unknown as { lookup: unknown }).lookup = async () => [
  { address: "203.0.113.10", family: 4 },
];

const realFetch = globalThis.fetch;
let searchCalls = 0;
let searchSeq = 0;
globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
  const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");

  if (url.includes("google.serper.dev")) {
    searchCalls++;
    searchSeq++;
    // 企業ごとに別ドメインを返す（同一ドメインだと重複除外に落ちて理由が変わる）
    const host = `crawlfail${searchSeq}.example.com`;
    return new Response(
      JSON.stringify({ organic: [{ title: "t", link: `https://${host}/`, snippet: "s", domain: host }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  // クロール対象は常に見つからない → ページ0件 = crawl_empty
  return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
}) as unknown as typeof fetch;

const crawlIds = makeCompanies("クロール失敗社", 5);
const crawlResult = await runEnrichmentBatch(5);

check("同じ理由が3件続いたら打ち切る", crawlResult.failed === 3);
check("打ち切り理由が crawl_empty として記録される", kindOf(crawlIds[0]) === "crawl_empty");
check(
  "残り2社は pending のまま",
  crawlIds.slice(3).every((id) => statusOf(id) === "pending")
);
check("企業固有の失敗では自動見回りを止めない", getEnrichmentPausedUntil() === null);
check("打ち切りまでに検索を呼んだのは3社ぶんだけ", searchCalls === 3);

globalThis.fetch = realFetch;
(dnsPromises as unknown as { lookup: unknown }).lookup = realLookup;
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* Windows ではDBを開いたまま消せないことがある。一時ディレクトリなので放置してよい */
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
