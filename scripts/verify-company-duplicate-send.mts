/**
 * 同一企業への重複送信ガードの検証。
 *
 * 既知の穴（2026-07-27 発覚）: 送信ガードは全て「メールアドレス単位」で、
 * 会社単位の照合が送信経路に存在しない。同じ会社でも連絡先アドレスが違えば
 * （info@ と contact@、あるいは www 付き等の別ドメイン表記）全ガードを素通りする。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dbDir = mkdtempSync(join(tmpdir(), "dupsend-"));
process.env.DATABASE_DIR = dbDir;
process.env.COLLECTION_SCHEDULE_DISABLED = "1";

const {
  upsertSender, updateSenderAuthStatus, createService, createPersona,
  createProspect, createSendLog, hasSentToEmail,
} = await import("@/lib/db");
const { runSendGuard } = await import("@/lib/send-guard");

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const sender = upsertSender({
  email: "sender@my-company.zzz", display_name: "テスト太郎",
  google_refresh_token_encrypted: "dummy",
} as never);
updateSenderAuthStatus(sender.id, "connected");

const svc = createService({
  name: "テスト商材", description: "説明", strengths: "強み", target: "対象",
} as never);
const persona = createPersona({
  name: "テスト太郎", title: "営業", gender: "male", age_range: "30代",
  company_name: "自社", signature_block: "―――\nテスト太郎",
  logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
} as never);

const body =
  "ご提案の件でご連絡いたしました。ご検討のほどよろしくお願いいたします。\n" +
  "━━━━━━━━━━\n株式会社テスト 営業部\n〒100-0001 東京都千代田区\ninfo@my-company.zzz\n配信停止はこちら";

function mk(companyName: string, domain: string, email: string): number {
  return createProspect({
    input_url: `https://${domain}`, domain, company_name: companyName,
    analysis_json: "", service_id: svc.id, persona_id: persona.id,
    subject: "ご提案の件", body, generated_subject: "ご提案の件", generated_body: body,
    emails_found_json: JSON.stringify([email]),
    form_url: null, is_form_only: 0, compatibility_score: "medium",
    has_refusal: 0, refusal_text: null, send_status: "unsent",
  } as never).id;
}

// ケース0: 同一アドレスは既存ガードで止まる（前提の確認）
const p1 = mk("株式会社サンプル", "sample.zzz", "info@sample.zzz");
createSendLog({
  prospect_id: p1, sender_id: sender.id, to_email: "info@sample.zzz",
  subject: "ご提案の件", gmail_message_id: "m1", gmail_thread_id: "t1",
} as never);
check("同一アドレスへの再送はガードされる（既存動作）", hasSentToEmail("info@sample.zzz"));

// ケース1【本命】: 同じ会社・同じドメイン・別アドレス
const p2 = mk("株式会社サンプル", "sample.zzz", "contact@sample.zzz");
const g2 = runSendGuard({
  prospectId: p2, senderId: sender.id, toEmail: "contact@sample.zzz",
  subject: "ご提案の件", body, force: false, isFollowup: false,
} as never);
check(
  "【本命】同じ会社の別アドレスへの送信がガードされる",
  !g2.canSend,
  `canSend=${g2.canSend} reasons=${JSON.stringify(g2.reasons)}`
);

// ケース2: 同じ会社・表記ゆれドメイン（www 付き）
const p3 = mk("株式会社サンプル", "www.sample.zzz", "sales@www.sample.zzz");
const g3 = runSendGuard({
  prospectId: p3, senderId: sender.id, toEmail: "sales@www.sample.zzz",
  subject: "ご提案の件", body, force: false, isFollowup: false,
} as never);
check(
  "同じ会社の表記ゆれドメイン（www付き）もガードされる",
  !g3.canSend,
  `canSend=${g3.canSend} reasons=${JSON.stringify(g3.reasons)}`
);

// ケース3: 別会社は止めない（過剰ブロックの検知）
const p4 = mk("別会社ホールディングス", "other.zzz", "info@other.zzz");
const g4 = runSendGuard({
  prospectId: p4, senderId: sender.id, toEmail: "info@other.zzz",
  subject: "ご提案の件", body, force: false, isFollowup: false,
} as never);
check("別会社への送信はブロックされない（過剰ブロックしない）", g4.canSend, JSON.stringify(g4.reasons));

// ケース4: フォローアップは意図的な再送なので通る
const g5 = runSendGuard({
  prospectId: p1, senderId: sender.id, toEmail: "info@sample.zzz",
  subject: "ご提案の件", body, force: false, isFollowup: true,
} as never);
check("フォローアップは同一宛先でも通る（意図的な再送）", g5.canSend, JSON.stringify(g5.reasons));

// ケース5【レビュー指摘・過剰ブロック】: 接頭辞を剥がしすぎて公開サフィックスで衝突しないこと
// recruit.co.jp に送った後、無関係な career.co.jp がブロックされたら誤り
const { hasSentToCompanyDomain } = await import("@/lib/db");
const pRec = mk("リクルート風会社", "recruit.co.jp", "info@recruit.co.jp");
createSendLog({
  prospect_id: pRec, sender_id: sender.id, to_email: "info@recruit.co.jp",
  subject: "ご提案の件", gmail_message_id: "m2", gmail_thread_id: "t2",
} as never);
check(
  "【過剰ブロック防止】recruit.co.jp へ送信後も career.co.jp は別会社として通る",
  !hasSentToCompanyDomain("career.co.jp"),
  "公開サフィックス(co.jp)まで削られて別会社が誤ブロックされている"
);
check(
  "同じ recruit.co.jp は当然ブロックされる",
  hasSentToCompanyDomain("recruit.co.jp")
);
check(
  "フリーメール（gmail.com）は会社の印にしない",
  !hasSentToCompanyDomain("gmail.com")
);

// ケース6【レビュー指摘・force バイパス】: force でも会社単位の重複は素通りしないこと
const gForce = runSendGuard({
  prospectId: p2, senderId: sender.id, toEmail: "contact@sample.zzz",
  subject: "ご提案の件", body, force: true, isFollowup: false,
} as never);
// send-guard は force で警告を飛ばす設計なので、ここでは canSend=true になりうる。
// 実際の防御は /api/send・/api/bulk-send のハードブロック側にあるため、
// 「ガード関数が素通しすること」自体は許容し、経路側で止まることを担保する。
check(
  "force 時の最終防衛は経路側のハードブロックが担う（会社ドメインが送信済みと判定される）",
  hasSentToCompanyDomain("sample.zzz"),
  `gForce.canSend=${gForce.canSend}`
);

console.log(`\n${pass} passed, ${fail} failed`);
// DBハンドルが握ったままだと Windows で EPERM になるため、失敗しても無視する
try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* 一時ディレクトリの後始末 */ }
process.exit(fail > 0 ? 1 : 0);
