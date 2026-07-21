/**
 * #2 二重送信CAS検証: claimProspectForSending は最初の1回だけ成功し、
 * 2回目以降（既にsending/sent）はfalseを返すことを確認する。
 */
import {
  createService, createPersona, createProspect,
  claimProspectForSending, getProspect, updateProspectStatus,
} from "@/lib/db";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const svc = createService({ name: "s", description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
function makeProspect() {
  return createProspect({
    input_url: "https://x.example.com", domain: "x.example.com", company_name: "X",
    analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
    subject: "s", body: "b", generated_subject: "s", generated_body: "b",
    emails_found_json: null, form_url: null, is_form_only: 0,
    compatibility_score: "high", has_refusal: 0, refusal_text: null, send_status: "unsent",
  } as any);
}

// 1. unsent の prospect は1回だけ claim できる
const p1 = makeProspect();
check("1回目のclaimは成功", claimProspectForSending(p1.id) === true);
check("claim後は send_status='sending'", String(getProspect(p1.id)?.send_status) === "sending");
check("2回目のclaimは失敗（二重送信ブロック）", claimProspectForSending(p1.id) === false);

// 2. 送信成功(sent)後も claim できない
updateProspectStatus(p1.id, "sent");
check("sent後のclaimは失敗", claimProspectForSending(p1.id) === false);

// 3. 送信失敗(failed)にロールバックされたら再claimできる（リトライ可能）
const p2 = makeProspect();
claimProspectForSending(p2.id);
updateProspectStatus(p2.id, "failed");
check("failed後は再claimできる（リトライ許可）", claimProspectForSending(p2.id) === true);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
