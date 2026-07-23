/**
 * メアド誤抽出の検証: 画像ファイル名(logo@2x.png 等)をメールと誤判定せず、
 * 本物のメールアドレスは正しく拾うことを確認する。
 */
import { extractEmails, isPlausibleEmail } from "@/lib/crawl";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// --- isPlausibleEmail: 誤抽出を弾く ---
check("logo@2x.png は誤抽出（png拡張子）→ 弾く", isPlausibleEmail("logo@2x.png") === false);
check("sprite@2x.jpg も弾く", isPlausibleEmail("sprite@2x.jpg") === false);
check("icon@3x.webp も弾く", isPlausibleEmail("icon@3x.webp") === false);
check("style@main.css も弾く", isPlausibleEmail("style@main.css") === false);
check("数字混じりTLD(foo@bar.2x)を弾く", isPlausibleEmail("foo@bar.2x") === false);

// --- isPlausibleEmail: 本物は残す ---
check("info@example.co.jp は本物", isPlausibleEmail("info@example.co.jp") === true);
check("contact@company.jp は本物", isPlausibleEmail("contact@company.jp") === true);
check("sales@example.com は本物", isPlausibleEmail("sales@example.com") === true);
check("a@b.io は本物", isPlausibleEmail("a@b.io") === true);

// --- extractEmails: 本文からの抽出でも誤抽出を落とす ---
check("本文中の logo@2x.png は抽出しない",
  extractEmails("<img> のファイルは logo@2x.png です").length === 0);
check("本文中の本物メアドは抽出する",
  extractEmails("お問い合わせは info@example.co.jp まで").includes("info@example.co.jp"));
check("誤抽出と本物が混在→本物だけ残す", (() => {
  const r = extractEmails("素材 logo@2x.png / 連絡先 sales@test-corp.jp");
  return r.includes("sales@test-corp.jp") && !r.includes("logo@2x.png");
})());

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
