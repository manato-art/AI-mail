/**
 * 生成状態フィルタの検証。
 * - getDistinctProspectDomains / gen-status エンドポイントが生成済み・送信済みドメインを返す
 * - www 付き prospect.domain が www 除去済み company.domain と一致する（正規化）
 * - classifyGenStatus が 送信済み > 生成済み > 未生成 の優先で分類する
 */
import {
  createService,
  createPersona,
  createProspect,
  createSendLog,
  upsertSender,
  getAllProspects,
} from "@/lib/db";
import { classifyGenStatus, normGenDomain } from "@/lib/gen-status";
import { GET as genStatusGET } from "@/app/api/companies/gen-status/route";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `gs-svc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `gs-sender-${seed}@example.co.jp`, display_name: "テスト", google_refresh_token_encrypted: "dummy",
});

const genDomainWww = `www.gs-generated-${seed}.com`; // www付き（prospect.domain は hostname 由来で www を含みうる）
const genDomainBare = `gs-generated-${seed}.com`;
const sentDomain = `gs-sent-${seed}.com`;

// 生成のみ（未送信）の prospect
createProspect({
  input_url: "https://x", domain: genDomainWww, company_name: "生成のみ社",
  analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
  subject: "s", body: "b", generated_subject: "s", generated_body: "b",
  emails_found_json: null, form_url: null, is_form_only: 0,
  compatibility_score: "medium", has_refusal: 0, refusal_text: null, send_status: "unsent",
} as never);

// 送信済みの prospect（send_log あり = 送信済み扱い）
const sentProspect = createProspect({
  input_url: "https://y", domain: sentDomain, company_name: "送信済み社",
  analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
  subject: "s", body: "b", generated_subject: "s", generated_body: "b",
  emails_found_json: null, form_url: null, is_form_only: 0,
  compatibility_score: "medium", has_refusal: 0, refusal_text: null, send_status: "sent",
} as never);
createSendLog({
  prospect_id: sentProspect.id, sender_id: sender.id,
  to_email: `contact@${sentDomain}`, subject: "s",
  gmail_message_id: `gs-msg-${seed}`, gmail_thread_id: `gs-th-${seed}`,
});

// --- エンドポイントが両集合を返し、www が正規化される ---
const res = await genStatusGET();
const data = (await res.json()) as { sentDomains: string[]; generatedDomains: string[] };
const sentSet = new Set(data.sentDomains);
const genSet = new Set(data.generatedDomains);

check("generatedDomains に生成ドメインが正規化されて入る（www除去）", genSet.has(genDomainBare));
check("generatedDomains に www 付きの生ドメインは入らない", !genSet.has(genDomainWww));
check("sentDomains に送信済みドメインが入る", sentSet.has(sentDomain));

// --- classifyGenStatus: 優先順位 ---
check("送信済みドメイン → sent", classifyGenStatus(sentDomain, sentSet, genSet) === "sent");
check("生成のみドメイン（company.domain は www 無し） → generated",
  classifyGenStatus(genDomainBare, sentSet, genSet) === "generated");
check("未知ドメイン → none", classifyGenStatus(`gs-unknown-${seed}.com`, sentSet, genSet) === "none");
check("domain 空 → none", classifyGenStatus("", sentSet, genSet) === "none");
check("送信済みかつ生成済みなら送信済みを優先",
  classifyGenStatus(sentDomain, sentSet, new Set([...genSet, sentDomain])) === "sent");
check("normGenDomain は www を除去し小文字化する",
  normGenDomain("WWW.Example.COM") === "example.com");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
