/**
 * #7 並行二重送信対策 claimEmailForSend / releaseEmailClaim の検証。
 * - 同一宛先へ進行中クレームがあれば2件目は null（＝並行送信を1件に絞る）
 * - 解放すれば再びクレームできる（正常な逐次送信は妨げない）
 * - 大文字小文字/前後空白は同一キーに正規化される
 * - 別宛先は独立してクレームできる
 */
import { claimEmailForSend, releaseEmailClaim, getAllProspects } from "@/lib/db";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const emailA = `claim-${seed}@example.co.jp`;
const emailB = `other-${seed}@example.co.jp`;

// 1. 1件目は成功、2件目（未解放）は null（並行送信を弾く）
const c1 = claimEmailForSend(emailA);
check("1件目のクレームは成功（id が返る）", typeof c1 === "number");
const c2 = claimEmailForSend(emailA);
check("進行中の同一宛先への2件目は null（並行二重送信を防止）", c2 === null);

// 2. 大文字/前後空白は同一キー扱い
const c2b = claimEmailForSend(`  ${emailA.toUpperCase()}  `);
check("大文字/空白ゆれでも同一宛先とみなしブロック", c2b === null);

// 3. 別宛先は独立してクレームできる
const cB = claimEmailForSend(emailB);
check("別宛先は独立してクレームできる", typeof cB === "number");

// 4. 解放すれば再びクレームできる（逐次の正常送信は妨げない）
releaseEmailClaim(c1 as number);
const c3 = claimEmailForSend(emailA);
check("解放後は同一宛先を再クレームできる", typeof c3 === "number");

// 後片付け
releaseEmailClaim(c3 as number);
releaseEmailClaim(cB as number);
// 5. 存在しない/二重解放でも例外にならない
releaseEmailClaim(c1 as number);
check("二重解放・存在しないIDの解放でも落ちない", true);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
