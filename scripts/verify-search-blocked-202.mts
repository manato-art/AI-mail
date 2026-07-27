/**
 * 検索元の「202 = bot検知ページ」をブロックとして扱えることの検証。
 *
 * 202 は res.ok が true になるため、!res.ok の中でだけブロック判定していると
 * 「正常応答なのに結果0件」として静かに素通りする。その結果、実際にはブロック
 * されているのに「この会社は調べられませんでした」を1社ずつ記録し続けることになる。
 */
process.env.SEARCH_TIMEOUT_MS = "3000";

const { BLOCKED_STATUSES, SearchBlockedError, SearchConfigError, webSearch } = await import(
  "@/lib/keyword-search"
);
const { scrapeSearch } = await import("@/lib/keyword-search-scrape");
const { fetchWantedlyListings } = await import("@/lib/wantedly-scraper");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const realFetch = globalThis.fetch;
function mockResponse(status: number, body: string) {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { "content-type": "text/html" } })) as typeof fetch;
}

// --- 定義そのもの ---
check("202 はブロック扱いのステータスに含まれる", BLOCKED_STATUSES.has(202));
check("従来の403/429/503も維持されている",
  BLOCKED_STATUSES.has(403) && BLOCKED_STATUSES.has(429) && BLOCKED_STATUSES.has(503));

// --- DDGスクレイプ: 202 は「0件」ではなくブロックとして throw ---
mockResponse(202, "<html><body>Unfortunately, bots use this site too...</body></html>");
let ddg: unknown = null;
try {
  const items = await scrapeSearch("テスト クエリ");
  ddg = `throwせず ${items.length} 件返した`;
} catch (e) {
  ddg = e;
}
check("DDG 202 は SearchBlockedError（静かな0件にしない）",
  ddg instanceof SearchBlockedError && ddg.status === 202);

// --- 200 の正常応答はこれまで通り（ブロック判定の前倒しで壊していない） ---
mockResponse(
  200,
  `<html><body><div class="result">
     <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.co.jp%2F">例社</a>
     <div class="result__snippet">説明</div>
   </div></body></html>`
);
let okItems: number | string;
try {
  okItems = (await scrapeSearch("テスト クエリ")).length;
} catch (e) {
  okItems = `例外: ${e}`;
}
check("200の正常応答はthrowせずパースする", okItems === 1);

// --- Wantedly スクレイパーも同じ判定を共有する ---
mockResponse(202, "<html><body>bot check</body></html>");
let wantedly: unknown = null;
try {
  await fetchWantedlyListings(1);
  wantedly = "throwしなかった";
} catch (e) {
  wantedly = e;
}
check("Wantedly 202 もブロックとして即停止",
  wantedly instanceof SearchBlockedError && wantedly.status === 202);

// --- 401（キー無効）は「時間を置けば直る」ブロックではなく設定エラー ---
globalThis.fetch = (async () => ({
  ok: false,
  status: 401,
  text: async () => "",
})) as unknown as typeof fetch;
let unauthorized: unknown = null;
try {
  await webSearch("invalid-key", "q", 0);
} catch (e) {
  unauthorized = e;
}
check("401 は SearchConfigError（設定を直す導線に載せる）",
  unauthorized instanceof SearchConfigError);
check("401 は SearchBlockedError ではない（再試行待ちにしない）",
  !(unauthorized instanceof SearchBlockedError));

globalThis.fetch = realFetch;
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
