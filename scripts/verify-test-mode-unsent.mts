/**
 * テスト送信は「未送信」扱いになる検証（recordSuccessfulSend の testMode 分岐）。
 * - testMode=true: prospect は unsent のまま・send_log を残さない（企業一覧バッジ・履歴とも未送信）。
 * - testMode=false: 従来どおり sent＋send_log。
 */
import {
  createService,
  createPersona,
  createProspect,
  upsertSender,
  updateProspectStatus,
  getProspect,
  getSendCountsByDomain,
  getAllProspects,
} from "@/lib/db";
import { recordSuccessfulSend } from "@/lib/post-send";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `tm-svc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `tm-sender-${seed}@example.co.jp`, display_name: "テスト", google_refresh_token_encrypted: "dummy",
});

function mkProspect(domain: string): number {
  return createProspect({
    input_url: "https://x", domain, company_name: "テスト社",
    analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
    subject: "s", body: "b", generated_subject: "s", generated_body: "b",
    emails_found_json: null, form_url: null, is_form_only: 0,
    compatibility_score: "medium", has_refusal: 0, refusal_text: null, send_status: "unsent",
  } as never).id;
}

const testDomain = `tm-test-${seed}.zzz`;
const realDomain = `tm-real-${seed}.zzz`;

// --- testMode=true: unsent のまま・send_log 無し ---
const p1 = mkProspect(realDomain);
updateProspectStatus(p1, "sending"); // 送信直前の状態を再現
recordSuccessfulSend(
  { prospectId: p1, senderId: sender.id, toEmail: `me@${testDomain}`, realToEmail: `real@${realDomain}`, subject: "s", messageId: `tm-a-${seed}`, threadId: "t" },
  true
);
check("testMode: prospect が unsent に戻る（未送信扱い）", getProspect(p1)?.send_status === "unsent");
check("testMode: send_log を残さない（テストドメインが集計に出ない）", !(testDomain in getSendCountsByDomain()));

// --- testMode=false: sent＋send_log ---
const p2 = mkProspect(realDomain);
updateProspectStatus(p2, "sending");
recordSuccessfulSend(
  { prospectId: p2, senderId: sender.id, toEmail: `contact@${realDomain}`, realToEmail: `contact@${realDomain}`, subject: "s", messageId: `tm-b-${seed}`, threadId: "t2" },
  false
);
check("非testMode: prospect が sent になる", getProspect(p2)?.send_status === "sent");
check("非testMode: send_log が残る（実ドメインが集計に出る）", (getSendCountsByDomain()[realDomain] ?? 0) >= 1);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
