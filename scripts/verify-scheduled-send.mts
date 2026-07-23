/**
 * 予約送信の開通テスト: 期日到来済みの予約prospectを runScheduledSendBatch が拾い、
 * ガード→クレーム→sendEmail まで到達することを確認する（ダミートークンなのでGmailだけ失敗＝
 * failedに落ちる）。これで「時刻到来で自動送信」の配線が端まで繋がっていることを保証する。
 */
import {
  createService,
  createPersona,
  createProspect,
  upsertSender,
  updateSenderAuthStatus,
  scheduleProspect,
  getProspect,
  getAllProspects,
} from "@/lib/db";
import { runScheduledSendBatch } from "@/lib/send-scheduler";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `schedsvc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `schedsender-${seed}@example.co.jp`, display_name: "テスト太郎", google_refresh_token_encrypted: "dummy",
});
updateSenderAuthStatus(sender.id, "connected");

const recipient = `sched-${seed}@target-sched-test.co.jp`;
const body =
  "予約テストのご連絡です。ご検討のほどよろしくお願いいたします。\n" +
  "━━━━━━━━━━\n株式会社テスト 営業部\n〒100-0001 東京都千代田区\ninfo@test-sender.co.jp\n配信停止はこちら";
const p = createProspect({
  input_url: "https://x.example.com", domain: "target-sched-test.co.jp", company_name: "予約テスト社",
  analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
  subject: "予約テストの件", body, generated_subject: "予約テストの件", generated_body: body,
  emails_found_json: JSON.stringify([recipient]),
  form_url: null, is_form_only: 0, compatibility_score: "medium", has_refusal: 0, refusal_text: null,
  send_status: "unsent",
} as any);

// 予定時刻を1分前(UTC)にして「期日到来済み」にする
const pastUtc = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace("T", " ");
scheduleProspect(p.id, { scheduledAt: pastUtc, senderId: sender.id, toEmail: recipient, subject: "予約テストの件", body });
check("予約状態になっている（scheduled）", getProspect(p.id)?.send_status === "scheduled");

const result = await runScheduledSendBatch(50);
console.log(`  → runScheduledSendBatch: ${JSON.stringify(result)}  status=${getProspect(p.id)?.send_status}`);

check("期日到来分を拾って処理した（processed>=1）", result.processed >= 1);
check("Gmail送信段まで到達し、ダミー資格情報で失敗（failed>=1・sent=0）", result.failed >= 1 && result.sent === 0);
check("処理後はscheduledのまま残らない（failedに遷移）", getProspect(p.id)?.send_status === "failed");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
