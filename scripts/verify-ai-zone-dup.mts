/**
 * AIゾーン重複バグの回帰テスト。
 * 空の {{AI:}} を複数置いたとき（UIのデフォルト挿入がまさに空 {{AI:}}）、
 * 各ゾーンの生成文脈で「挿入目印」がそのゾーンの実際の位置に付くことを確認する。
 *
 * 旧実装は String.replace（文字列一致・先頭1個のみ置換）だったため、
 * 2個目以降の文脈でも目印が常に1個目の位置に付き、生成がズレていた。
 */
import { buildZoneContexts } from "@/lib/compose";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const MARK = "【★ここに挿入する文章★】";
const HIDDEN = "（別途生成される部分）";

// 空の {{AI:}} を2個。文字列としては完全に同一。
const BODY = "冒頭A\n{{AI:}}\n中盤B\n{{AI:}}\n末尾C";

const ctxs = buildZoneContexts(BODY);

check("ゾーン数分の文脈が返る", ctxs.length === 2);

// zone0: 目印は冒頭Aと中盤Bの間。2個目のゾーンは伏せられる。
check("zone0の目印は冒頭Aと中盤Bの間", ctxs[0].includes(`冒頭A\n${MARK}\n中盤B`));
check("zone0では2個目ゾーンが伏せられる", ctxs[0].includes(`中盤B\n${HIDDEN}\n末尾C`));

// zone1: 目印は中盤Bと末尾Cの間。1個目のゾーンは伏せられる。
check("zone1の目印は中盤Bと末尾Cの間", ctxs[1].includes(`中盤B\n${MARK}\n末尾C`));
check("zone1では1個目ゾーンが伏せられる", ctxs[1].includes(`冒頭A\n${HIDDEN}\n中盤B`));

// 核心の回帰防止: 2つの空ゾーンで文脈が異なること（旧バグでは同一になっていた）。
check("2つの空ゾーンで文脈が異なる（重複バグの回帰防止）", ctxs[0] !== ctxs[1]);

// 目印はどの文脈にもちょうど1個だけ（対象ゾーンのみ）。
check("zone0の目印は1個だけ", ctxs[0].split(MARK).length - 1 === 1);
check("zone1の目印は1個だけ", ctxs[1].split(MARK).length - 1 === 1);

// 固定文はそのまま残る。
check("固定文はそのまま残る", ctxs[0].includes("冒頭A") && ctxs[0].includes("中盤B") && ctxs[0].includes("末尾C"));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
