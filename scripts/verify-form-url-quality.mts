/**
 * フォームURL・メールアドレスの抽出品質の検証。
 *
 * form_url を実際に保存して営業リストに使う以上、
 *  - PDFの申込用紙を「問い合わせフォーム」として数えない（連絡可能件数の水増し防止）
 *  - 要素の連結でできた壊れたアドレスを送信対象にしない（バウンス→送信ドメイン評価の毀損）
 * の2点は品質の前提になる。
 */
import {
  detectFormUrl,
  extractEmails,
  extractFullBodyText,
  isNonFormDocumentUrl,
  isPlausibleEmail,
} from "@/lib/crawl";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const BASE = "https://example.co.jp/";

// --- detectFormUrl: PDF等の配布ファイルはフォームではない ---
const pdfOnly = `<html><body>
  <a href="/files/toiawase-1.pdf">お問い合わせ</a>
</body></html>`;
check("PDFの問い合わせ用紙はフォーム扱いしない", detectFormUrl(pdfOnly, BASE) === null);

for (const ext of ["doc", "docx", "xls", "xlsx"]) {
  const html = `<html><body><a href="/form.${ext}">お問い合わせ</a></body></html>`;
  check(`.${ext} もフォーム扱いしない`, detectFormUrl(html, BASE) === null);
}

const realForm = `<html><body>
  <a href="/contact/">お問い合わせ</a>
</body></html>`;
check("通常の問い合わせページはフォームとして拾う",
  detectFormUrl(realForm, BASE) === "https://example.co.jp/contact/");

const inlineForm = `<html><body><form action="/send"><input name="a" /></form></body></html>`;
check("ページ内に form があればそのページをフォームとする",
  detectFormUrl(inlineForm, BASE) === BASE);

const pdfAndReal = `<html><body>
  <a href="/files/toiawase.pdf">お問い合わせ用紙</a>
  <a href="/contact/">お問い合わせフォーム</a>
</body></html>`;
check("PDFを飛ばして本物のフォームを拾う",
  detectFormUrl(pdfAndReal, BASE) === "https://example.co.jp/contact/");

check("isNonFormDocumentUrl: クエリ付きPDFも判定できる",
  isNonFormDocumentUrl("/files/a.pdf?v=2") === true);
check("isNonFormDocumentUrl: 通常ページは false",
  isNonFormDocumentUrl("/contact/") === false);

// --- 破損メールアドレス（要素の連結で生まれる）を弾く ---
check("連結で生まれた privacy@example.co.jptop を弾く",
  isPlausibleEmail("privacy@example.co.jptop") === false);
check("極端に長いTLDを弾く",
  isPlausibleEmail("a@example.abcdefghijklmnopqrstuvwxyz") === false);
check("正しい .co.jp は通す", isPlausibleEmail("info@example.co.jp") === true);
check("2文字のccTLDは通す（網羅できないため長さで許可）",
  isPlausibleEmail("a@example.io") === true && isPlausibleEmail("a@example.us") === true);
check("主要gTLDは通す",
  ["com", "net", "org", "info", "biz", "app", "dev", "tokyo"].every((t) =>
    isPlausibleEmail(`a@example.${t}`)
  ));

// --- 根本対策: ブロック要素の境目に区切りを入れてから抽出する ---
const gluedHtml = `<html><body>
  <div><a href="mailto:privacy@example.co.jp">privacy@example.co.jp</a></div><nav>TOPプライバシーポリシー</nav>
</body></html>`;
const text = extractFullBodyText(gluedHtml);
const emails = extractEmails(text);
check("要素をまたいでも本物のアドレスを拾える", emails.includes("privacy@example.co.jp"));
check("連結由来の壊れたアドレスは1件も混ざらない",
  emails.every((e) => !e.includes("jptop")));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
