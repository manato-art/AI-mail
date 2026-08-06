/**
 * 全角波括弧ガード（2026-08-06 追加）と、連絡先ごとのLP設定の検証。
 * 本物の runSendGuard / setContactLpUrl を実DB(一時ディレクトリ)で叩く。npx tsx で実行。
 *
 * なぜこの検証が要るか:
 *   テンプレに `｛｛店舗HPのURL｝｝` と全角で書くと、置換もされず未解決検知にも掛からず、
 *   **記号のまま顧客に届いていた**（実際に3回起きた）。直したつもりを防ぐため、
 *   「全角は止まる／半角の正常系は止まらない」を両方確かめる。
 */
import { runSendGuard, checkFullwidthBraces } from "@/lib/send-guard";
import { upsertSender, upsertContact, setContactLpUrl } from "@/lib/db";

const BODY = "本文です。\n━━━━━━━━\n株式会社テスト 営業部\n配信停止はこちら";
const SUBJECT = "ご提案の件";

const sender = upsertSender({
  email: "sales@example.co.jp",
  display_name: "テスト太郎",
  google_refresh_token_encrypted: "dummy",
});

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${label} : ${JSON.stringify(got)} (期待=${JSON.stringify(want)})`);
  ok ? pass++ : fail++;
}

const guard = (subject: string, body: string, force: boolean) =>
  runSendGuard({ toEmail: "clean@target.co.jp", subject, body, senderId: sender.id, force }).canSend;

console.log("── 全角波括弧ガード ──");
// ★ 本命: これが今まで素通りしていた
check("全角 ｛｛店舗HPのURL｝｝ → ブロック", guard(SUBJECT, `${BODY}\n｛｛店舗HPのURL｝｝`, false), false);
check("全角・force=true → それでもブロック", guard(SUBJECT, `${BODY}\n｛｛店舗HPのURL｝｝`, true), false);
check("件名に全角 → ブロック", guard(`【｛｛company_name｝｝様】`, BODY, true), false);
check("全角1個 ｛x｝ → ブロック", guard(SUBJECT, `${BODY}\n｛x｝`, true), false);

// 誤検知していないこと（正常系を止めたら業務が止まる）
check("半角の正常な本文 → 通る", guard(SUBJECT, BODY, true), true);
check("AIゾーン {{AI:}} → 通る", guard(SUBJECT, `${BODY}\n{{AI:}}`, true), true);
check("波括弧が無い日本語 → 通る", guard(SUBJECT, `${BODY}\n【ご案内】お問い合わせは（電話）まで`, true), true);

console.log("\n── 検出関数そのもの ──");
check("検出: 全角2連", checkFullwidthBraces("", "｛｛a｝｝"), ["｛｛a｝｝"]);
check("検出: 重複は1つに畳む", checkFullwidthBraces("", "｛｛a｝｝と｛｛a｝｝"), ["｛｛a｝｝"]);
check("検出: 半角は拾わない", checkFullwidthBraces("", "{{company_name}}"), []);

console.log("\n── 連絡先ごとのLP設定 ──");
const contact = upsertContact({
  company_id: null,
  company_name: "そば処テスト本店",
  person_name: "",
  email: "info@soba-test.example.jp",
  email_source_url: null,
  source: "manual",
  lp_url: null,
});
check("既存の連絡先に後からURLを入れられる",
  setContactLpUrl(contact.email, "https://preview.example.com/s/abc123"), "updated");
check("同じ値なら unchanged",
  setContactLpUrl(contact.email, "https://preview.example.com/s/abc123"), "unchanged");
check("居ないアドレスは not_found（成功として返さない）",
  setContactLpUrl("nobody@nowhere.example.jp", "https://preview.example.com/s/x"), "not_found");
// upsertContact は既存行に何もしないので、この経路が無いと後入れできない（これが元の欠陥）
check("upsertContact 経由では上書きされないまま",
  upsertContact({ company_id: null, company_name: "そば処テスト本店", person_name: "", email: contact.email, email_source_url: null, source: "manual", lp_url: "https://preview.example.com/s/OVERWRITE" }).lp_url,
  "https://preview.example.com/s/abc123");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
