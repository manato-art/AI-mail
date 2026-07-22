/**
 * #9/#10 の共通処理 recordSuccessfulSend の検証。
 * - 正常系: send_log を書き、prospect を 'sent' にし、警告を返さない
 * - 送信履歴の記録に失敗した場合(FK違反で createSendLog を確実に失敗させる):
 *     警告を返し、かつ実宛先を抑止リストへ登録して将来の再送を止める（#10）
 * 送信成功後の処理なので、いずれの失敗でも prospect を 'unsent' に戻さないのが不変条件。
 */
import {
  createService,
  createPersona,
  createProspect,
  upsertSender,
  getProspect,
  getSendLogByProspect,
  isEmailSuppressed,
  getAllProspects,
} from "@/lib/db";
import { recordSuccessfulSend } from "@/lib/post-send";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `psvc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `psender-${seed}@example.co.jp`, display_name: "T", google_refresh_token_encrypted: "x",
});
function makeProspect() {
  return createProspect({
    input_url: "", domain: "x.example.com", company_name: "X",
    analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
    subject: "s", body: "b", generated_subject: "s", generated_body: "b",
    emails_found_json: null, form_url: null, is_form_only: 0,
    compatibility_score: "high", has_refusal: 0, refusal_text: null, send_status: "sending",
  } as any);
}

// 1. 正常系: 記録成功
const p1 = makeProspect();
const r1 = recordSuccessfulSend({
  prospectId: p1.id, senderId: sender.id,
  toEmail: `ok-${seed}@t.co.jp`, realToEmail: `ok-${seed}@t.co.jp`,
  subject: "s", messageId: `m1-${seed}`, threadId: "th1",
});
check("正常系: 警告なし", r1.warnings.length === 0);
check("正常系: send_log が作られる", getSendLogByProspect(p1.id).length === 1);
check("正常系: prospect が sent に確定", getProspect(p1.id)?.send_status === "sent");

// 2. 送信履歴の記録失敗（存在しない prospect_id で FK 違反 → createSendLog が確実に throw）
const realEmail = `logfail-${seed}@t.co.jp`;
const r2 = recordSuccessfulSend({
  prospectId: 2_000_000_000 + seed, senderId: sender.id,
  toEmail: realEmail, realToEmail: realEmail,
  subject: "s", messageId: `m2-${seed}`, threadId: "th2",
});
check("記録失敗: 警告が返る（送信自体は成功扱い）", r2.warnings.length >= 1);
check("記録失敗: 実宛先が抑止リストに登録される（#10・再送防止）", !!isEmailSuppressed(realEmail));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
