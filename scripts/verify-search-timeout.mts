/**
 * 検索fetchのタイムアウト検証（収集が固まる根本原因の修正）。
 * 応答が来ない検索は「無限待ち」ではなく throw することを確認する。
 * env を先に設定して keyword-search を動的 import することで短いタイムアウトで検証する。
 */
process.env.SEARCH_TIMEOUT_MS = "80";
const { webSearch, SearchBlockedError } = await import("@/lib/keyword-search");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const origFetch = globalThis.fetch;

// 1) 応答が来ない → タイムアウトで throw（=収集ジョブが固まらず finally でロック解放できる）
// 実fetchと同様、abort シグナルが立ったら reject する（そうでないと abort を無視して永久待ちになる）
(globalThis as unknown as { fetch: unknown }).fetch = (_url: string, init?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal) {
      signal.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError"))
      );
    }
  });
let timedOut = false, msg = "";
const t0 = Date.now();
try {
  await webSearch("dummy-key", "テスト", 0);
} catch (e) {
  timedOut = true;
  msg = e instanceof Error ? e.message : String(e);
}
const elapsed = Date.now() - t0;
check("応答なし → タイムアウトで throw する", timedOut && /タイムアウト/.test(msg));
check("実際に打ち切る（TTL 80ms 付近で戻る < 3s）", elapsed < 3000);

// 2) 正常応答は正しくパースする（タイムアウト導入で壊していない）
(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
  ok: true,
  json: async () => ({ organic: [{ title: "t", link: "https://ex.com", snippet: "s", domain: "ex.com" }] }),
});
const items = await webSearch("k", "q", 0);
check("正常応答は正しくパースする", items.length === 1 && items[0].link === "https://ex.com");

// 3) 429 は SearchBlockedError のまま（タイムアウト変換に飲み込まれない）
(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
  ok: false,
  status: 429,
  text: async () => "",
});
let blocked = false;
try {
  await webSearch("k", "q", 0);
} catch (e) {
  blocked = e instanceof SearchBlockedError && e.status === 429;
}
check("429 は SearchBlockedError のまま", blocked);

globalThis.fetch = origFetch;
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
