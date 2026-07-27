/**
 * DNS解決のタイムアウト検証（KB: untimed-fetch-hang-holds-job-lock の再発防止）。
 *
 * dns.lookup にはタイムアウトが無く、fetch の AbortController は解決フェーズに効かない。
 * 応答しないDNSに当たると1社のクロールが無限に止まり、直列の調査バッチごと固まって
 * 収集ジョブのロックを握ったまま「実行中」が張り付く（画面にはエラーが一切出ない）。
 */
process.env.DNS_LOOKUP_TIMEOUT_MS = "300";

import dnsPromises from "node:dns/promises";

const { validateUrlWithDns } = await import("@/lib/ssrf");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const realLookup = dnsPromises.lookup;

// 1) 応答が返らないDNS → 待ち続けずに打ち切る
(dnsPromises as unknown as { lookup: unknown }).lookup = () => new Promise(() => {});
const t0 = Date.now();
const hung = await validateUrlWithDns("https://never-resolves.example.com/");
const elapsed = Date.now() - t0;

check("応答しないDNSでも必ず戻る（ハングしない）", hung.valid === false);
check("実際に打ち切っている（300ms付近で戻る < 3s）", elapsed < 3000);
check("理由が残る", !!hung.error);

// 2) 正常なDNSはこれまで通り通す（タイムアウト導入で壊していない）
(dnsPromises as unknown as { lookup: unknown }).lookup = async () => [
  { address: "203.0.113.10", family: 4 },
];
const ok = await validateUrlWithDns("https://good.example.com/");
check("正常な公開ドメインは通る", ok.valid === true);

// 3) 内部IPを指す偽装は引き続きブロックする
(dnsPromises as unknown as { lookup: unknown }).lookup = async () => [
  { address: "169.254.169.254", family: 4 },
];
const spoof = await validateUrlWithDns("https://evil.example.com/");
check("メタデータIPへの偽装は引き続きブロック", spoof.valid === false);

// 4) DNSが例外を投げる場合も従来どおり（解決できなかった扱い）
(dnsPromises as unknown as { lookup: unknown }).lookup = async () => {
  throw new Error("ENOTFOUND");
};
const notFound = await validateUrlWithDns("https://missing.example.com/");
check("解決失敗は従来どおり無効として返す", notFound.valid === false);

(dnsPromises as unknown as { lookup: unknown }).lookup = realLookup;
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
