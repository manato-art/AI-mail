/**
 * Wantedlyスクレイパーのブロック検知を検証する。
 * fetch をモックし、403/429/503 は SearchBlockedError で即停止、
 * それ以外(404等)は従来通り空ページ扱い(throwしない)ことを確認する。
 */
import { fetchWantedlyListings } from "@/lib/wantedly-scraper";
import { SearchBlockedError } from "@/lib/keyword-search";

const realFetch = globalThis.fetch;
function mockStatus(status: number) {
  globalThis.fetch = (async () =>
    new Response("blocked", {
      status,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
}

let pass = 0;
let fail = 0;

async function expectBlocked(status: number) {
  mockStatus(status);
  try {
    await fetchWantedlyListings(1);
    console.log(`❌ status ${status}: SearchBlockedError が投げられず素通りした`);
    fail++;
  } catch (e) {
    const ok = e instanceof SearchBlockedError && e.status === status;
    console.log(`${ok ? "✅" : "❌"} status ${status}: ${ok ? "即停止(SearchBlockedError)" : "別の例外: " + e}`);
    ok ? pass++ : fail++;
  }
}

async function expectNotBlocked(status: number) {
  mockStatus(status);
  try {
    const r = await fetchWantedlyListings(1);
    const ok = r.listings.length === 0 && r.emptyPages > 0;
    console.log(`${ok ? "✅" : "❌"} status ${status}: throwせず空ページ扱い (emptyPages=${r.emptyPages})`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`❌ status ${status}: throwすべきでないのに例外: ${e}`);
    fail++;
  }
}

for (const s of [403, 429, 503]) await expectBlocked(s);
for (const s of [404, 500]) await expectNotBlocked(s);

globalThis.fetch = realFetch;
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
