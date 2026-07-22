/**
 * 開通テスト: 「生成済みメールを各社へまとめて送信」が叩く実経路 /api/send を、
 * 生成済みprospect＋接続済み送信者で実際に呼び、送信パイプラインが端から端まで
 * 配線されていることを確認する。
 *
 * ダミートークンなので最後の Gmail 送信だけは失敗する（＝401/500で戻る）。
 * 逆に言えば、そこに到達している時点で
 *   prospect取得 → 変数解決/compose → 送信ガード通過 → danger通過 → CASクレーム → sendEmail
 * が全て繋がっている、という「開通」の証明になる（Gmail着信自体は本番で確認済み）。
 */
import {
  createService,
  createPersona,
  createProspect,
  upsertSender,
  updateSenderAuthStatus,
  getProspect,
  getAllProspects,
} from "@/lib/db";
import { POST } from "@/app/api/send/route";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `gensvc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `gensender-${seed}@example.co.jp`, display_name: "テスト太郎", google_refresh_token_encrypted: "dummy",
});
// 送信ガードは auth_status=connected を要求するので接続済みにする
updateSenderAuthStatus(sender.id, "connected");

// 署名あり・未解決変数なし・独自ドメイン外の宛先 → 送信ガードを通過する本文
const recipient = `open-${seed}@target-open-test.co.jp`;
const body =
  "ご提案の件でご連絡いたしました。ご検討のほどよろしくお願いいたします。\n" +
  "━━━━━━━━━━\n株式会社テスト 営業部\n〒100-0001 東京都千代田区\ninfo@test-sender.co.jp\n配信停止はこちら";
const p = createProspect({
  input_url: "https://x.example.com", domain: "target-open-test.co.jp", company_name: "開通テスト社",
  analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
  subject: "ご提案の件", body, generated_subject: "ご提案の件", generated_body: body,
  emails_found_json: JSON.stringify([recipient]),
  form_url: null, is_form_only: 0, compatibility_score: "medium", has_refusal: 0, refusal_text: null,
  send_status: "unsent",
} as any);

const req = new Request("http://localhost/api/send", {
  method: "POST",
  headers: { "content-type": "application/json" },
  // acknowledgedWarnings=true で warn 級を承知して押し切る（実機能の「警告を承知で送る」相当）
  body: JSON.stringify({ prospectId: p.id, senderId: sender.id, toEmail: recipient, acknowledgedWarnings: true }),
});
// NextRequest は Request 互換なのでそのまま渡す
const res = await POST(req as never);
const status = res.status;
const data = (await res.json()) as { error?: string; reasons?: string[] };

console.log(`  → /api/send 応答: ${status} ${JSON.stringify(data)}`);

// 開通の核心: ガード(422)や不備(400/404)で手前で止まらず、Gmail送信段(401/500)まで到達している
check("送信ガード等で手前ブロックされていない（422/400/404でない）", ![422, 400, 404].includes(status));
check("Gmail送信段まで到達している（401 REAUTH か 500 送信失敗で戻る）", status === 401 || status === 500);
check("送信失敗後、prospectはunsentに戻っている（再送可能・巻き戻し正常）",
  getProspect(p.id)?.send_status === "unsent");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
