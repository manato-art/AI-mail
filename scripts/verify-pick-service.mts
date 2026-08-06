/**
 * 商材の解決の検証（2026-08-06 追加）。
 *
 * 実際に起きたこと:
 *   一括送信の画面で商材「かってにHP」を選び、テンプレートも「かってにHP」を選んだのに、
 *   生成された本文に「きっかけ！インターン」（採用支援）の話が出た。
 *   画面の選択が API に渡っておらず、API は登録順の**先頭**を黙って使っていた。
 */
import { pickService } from "@/lib/pick-service";

interface S { id: number; name: string }
const ALL: S[] = [
  { id: 1, name: "きっかけ！インターン" },
  { id: 2, name: "かってにHP" },
];
const byId = (id: number) => ALL.find((s) => s.id === id);
const all = () => ALL;

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) console.log(`      得た値: ${JSON.stringify(got)}\n      期待  : ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// ★ 本命の再現: 画面で「かってにHP」(id=2) を選んだのに先頭が使われていた
check("画面の選択が最優先される",
  pickService(2, undefined, byId, all).service?.name, "かってにHP");
check("設定の既定値より画面の選択が勝つ",
  pickService(2, 1, byId, all).service?.name, "かってにHP");

console.log("");
check("未指定なら設定の既定値",
  pickService(undefined, 2, byId, all).service?.name, "かってにHP");
check("どちらも無ければ先頭（従来の挙動）",
  pickService(undefined, undefined, byId, all).service?.name, "きっかけ！インターン");
check("既定値が存在しないidなら先頭に落ちる",
  pickService(undefined, 999, byId, all).service?.name, "きっかけ！インターン");

console.log("");
// ★ ここが一番大事: 指定が解けないときに「別の商材で書き始めない」
const bad = pickService(999, 1, byId, all);
check("指定した商材が無ければエラー（既定に落とさない）", bad.service, undefined);
check("エラー理由が返る", typeof bad.error === "string" && bad.error.includes("999"), true);

check("0 や負数は未指定として扱う",
  pickService(0, 2, byId, all).service?.name, "かってにHP");
check("NaN は未指定として扱う",
  pickService(Number.NaN, 2, byId, all).service?.name, "かってにHP");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
