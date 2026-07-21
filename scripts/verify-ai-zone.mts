/**
 * ②AIブロック改修の検証: 指示が空ならデフォルトで「全体になじむ」指示が入り、
 * 周囲の本文が文脈として渡り、対象ゾーンだけが目印に置換されることを確認する。
 */
import {
  buildZoneContext,
  buildZoneUserPrompt,
  DEFAULT_ZONE_INSTRUCTION,
} from "@/lib/compose";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const BODY =
  "{{person_name}}様\n\n突然のご連絡失礼します。\n{{AI:}}\n\nご検討ください。\n{{AI:別の指示}}";

// 1. buildZoneContext: 対象ゾーンが目印に、他ゾーンは伏せられる
const ctx = buildZoneContext(BODY, "{{AI:}}");
check("対象ゾーンが【★ここに挿入する文章★】に置換される", ctx.includes("【★ここに挿入する文章★】"));
check("他のAIゾーンは『別途生成される部分』に伏せられる", ctx.includes("（別途生成される部分）") && !ctx.includes("{{AI:別の指示}}"));
check("固定文・差し込み変数はそのまま残る", ctx.includes("突然のご連絡失礼します") && ctx.includes("{{person_name}}"));

// 2. 指示が空 → デフォルト指示が入る
const emptyPrompt = buildZoneUserPrompt("", null, null, "テスト株式会社", ctx);
check("空指示ならデフォルト『全体になじむ』指示が入る", emptyPrompt.includes(DEFAULT_ZONE_INSTRUCTION));
check("空指示でも文脈(下書き)が渡る", emptyPrompt.includes("メール全体の下書き") && emptyPrompt.includes("【★ここに挿入する文章★】"));

// 3. 指示あり → 指示 + なじませ要求の両方
const withInstr = buildZoneUserPrompt("課題解決の実績に触れて", null, null, "テスト株式会社", ctx);
check("指示ありならその指示が入る", withInstr.includes("課題解決の実績に触れて"));
check("指示ありでも『全体になじむ』要求が付く", withInstr.includes("自然になじむように書くこと"));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
