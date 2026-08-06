/**
 * {{AI:...}} ゾーンの切り出しの検証（2026-08-06 追加）。
 *
 * 実際に起きたこと:
 *   指示文の中に `{{company_name}}` を書いたら、AIゾーンが**その途中で切れた**。
 *   AI_ZONE_PATTERN は `/\{\{AI:([\s\S]*?)\}\}/g` の**非貪欲**マッチで、
 *   最初に現れた `}}`（＝`{{company_name}}` の閉じ）で終わってしまうため。
 *   結果:
 *     1. AIには **途中で切れた指示** しか渡らない（末尾の条件が全部消える）
 *     2. 残った `}}様の魅力を…そこへ自然に渡すこと。}}` が
 *        **社内向けの指示文のまま顧客宛メールの本文に残る**
 *   実際に生成されたメールに、この指示文の断片がそのまま入っていた。
 */
import { extractAiZones, hasAiZones, buildZoneContexts, checkZoneOutput } from "@/lib/compose";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) console.log(`      得た値: ${JSON.stringify(got)}\n      期待  : ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// ★ 本命の再現。指示文の中に {{company_name}} がある
const NESTED = `前置き。

ホームページを拝見しておりましたら、{{AI:一文を書く。
1. 具体を挙げる。
2. 次の段落が「{{company_name}}様の魅力を、もう少し多くの方に」で始まるので、そこへ渡すこと。}}

{{company_name}}様の魅力を、もう少し多くの方に。`;

console.log("── 指示文に {{変数}} を含むゾーン ──");
const zones = extractAiZones(NESTED);
check("ゾーンは1個として認識される", zones.length, 1);
check("指示文が最後まで取れている（末尾の『そこへ渡すこと。』が残る）",
  zones[0]?.instruction.endsWith("そこへ渡すこと。"), true);
check("指示文に {{company_name}} を含んだまま取れる",
  zones[0]?.instruction.includes("{{company_name}}様の魅力"), true);

// ゾーンを消したあとに指示文の断片が残らないこと（＝顧客に届く事故の直接の再現）
const removed = NESTED.replace(zones[0]?.full ?? "@@none@@", "〈生成文〉");
check("ゾーンを置換すると指示文の断片が本文に残らない",
  /そこへ渡すこと。|一文を書く。|具体を挙げる。/.test(removed), false);
check("置換後に閉じ括弧の残骸 }} が無い", /\}\}/.test(removed.replace(/\{\{[a-z_]+\}\}/g, "")), false);

console.log("\n── 壊していないこと（従来の正常系） ──");
check("hasAiZones は従来どおり true", hasAiZones(NESTED), true);
check("ゾーンが無ければ false", hasAiZones("ただの本文です"), false);
const plain = extractAiZones("A{{AI:指示1}}B{{AI:}}C");
check("素朴な2ゾーンは2個", plain.length, 2);
check("1個目の指示", plain[0]?.instruction, "指示1");
check("2個目は空指示", plain[1]?.instruction, "");
check("文脈は各ゾーン分できる", buildZoneContexts("A{{AI:x}}B{{AI:y}}C").length, 2);

console.log("\n── 閉じ忘れ ──");
const broken = extractAiZones("A{{AI:閉じていない指示");
check("閉じ括弧が無いゾーンは採らない（未解決変数ガードに回す）", broken.length, 0);


// ── 生成結果の検査（実際に顧客宛の下書きへ入ってしまった文章で確かめる） ──
console.log("\n── 生成結果の検査 ──");
const REAL_FAILURE = [
  "申し訳ございませんが、今回のご依頼にはお応えしかねます。",
  "",
  "分析データを拝見したところ、相手先のサンワグループ様は**不動産・ケーブルテレビ事業者**であり、",
  "自社サービス「きっかけ！インターン」は**採用支援サービス**です。",
  "",
  "---",
  "",
  "**お力になれる条件が整えば、喜んで対応いたします。**",
  "1. **相手企業の公式サイトURL**",
  "情報が揃い次第、すぐに生成いたします。",
].join("\n");
check("実際に混入した断り文を弾く", checkZoneOutput(REAL_FAILURE) !== null, true);
check("Markdownの太字を弾く", checkZoneOutput("**不動産**の会社です") !== null, true);
check("空文字を弾く", checkZoneOutput("   ") !== null, true);
check("長すぎる出力を弾く", checkZoneOutput("あ".repeat(401)) !== null, true);
check(
  "まっとうな一文は通す",
  checkZoneOutput("明治四十年のご創業から五代にわたって受け継がれてきたこと、軽井沢駅の北口を出てすぐという場所のことを拝見しました。いまのホームページではそのお話が奥に置かれているように見受けられ、少しもったいなく感じた次第です。"),
  null
);
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
