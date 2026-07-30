/**
 * 送信の記録（send_log）を「いつ・どのアカウントから・どのGmailメッセージとして」
 * 画面に出せる形で取り出せることを検証する。
 *
 * 守るべき契約:
 *  1. ステータス（申告）ではなく send_log（記録）を根拠にする
 *  2. 予約送信でも同じ記録が残る（＝予約どおり送られたかを後から確かめられる）
 *  3. 日時表示はDBの素の文字列をUTCとして読む（そのままブラウザに渡すと9時間ずれる）
 */
import {
  createService,
  createPersona,
  createProspect,
  upsertSender,
  createSendLog,
  updateProspectStatus,
  getSendEvidenceByProspect,
  getSendEvidenceMap,
  getDbNow,
  getAllProspects,
} from "@/lib/db";
import { formatJst, formatJstFromMs, parseDbDate, diffMinutes } from "@/lib/datetime";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, got?: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}${cond ? "" : `\n   → got: ${got}`}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `ev-svc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `ev-sender-${seed}@example.co.jp`,
  display_name: "証跡テスト",
  google_refresh_token_encrypted: "dummy",
});

function makeProspect(domain: string) {
  return createProspect({
    input_url: `https://${domain}`, domain, company_name: `証跡社-${seed}`,
    analysis_json: "{}", service_id: svc.id, persona_id: persona.id,
    subject: "件名", body: "本文", generated_subject: "件名", generated_body: "本文",
    emails_found_json: JSON.stringify([`info@${domain}`]),
    form_url: null, is_form_only: 0, compatibility_score: "medium",
    has_refusal: 0, refusal_text: null, send_status: "unsent",
  } as never);
}

// --- 1. 送信記録が「時刻・宛先・送信元・Gmail控え」を伴って取れる ---
{
  const p = makeProspect(`ev-a-${seed}.zzz`);
  createSendLog({
    prospect_id: p.id, sender_id: sender.id, to_email: `info@ev-a-${seed}.zzz`,
    subject: "件名", gmail_message_id: `msg-a-${seed}`, gmail_thread_id: `thr-a-${seed}`,
  });
  const rows = getSendEvidenceByProspect(p.id);
  check("送信記録が1件取れる", rows.length === 1);
  check("Gmailの控え（メッセージID・スレッドID）が入っている",
    rows[0]?.gmail_message_id === `msg-a-${seed}` && rows[0]?.gmail_thread_id === `thr-a-${seed}`);
  check("送信元アカウントのメールが引けている", rows[0]?.sender_email === sender.email);
  check("送信時刻が記録されている（空でない）", Boolean(rows[0]?.sent_at));
}

// --- 2. ステータスを手で「送信済」にしただけでは記録は生まれない ---
{
  const p = makeProspect(`ev-b-${seed}.zzz`);
  updateProspectStatus(p.id, "sent");
  const rows = getSendEvidenceByProspect(p.id);
  check("ステータスだけ変えても送信記録は0件（申告と記録を混同しない）", rows.length === 0);
  const map = getSendEvidenceMap();
  check("一覧用の辞書にも出てこない", map[p.id] === undefined);
}

// --- 3. 複数回送っていれば最新＋通算回数が分かる ---
{
  const p = makeProspect(`ev-c-${seed}.zzz`);
  createSendLog({
    prospect_id: p.id, sender_id: sender.id, to_email: `info@ev-c-${seed}.zzz`,
    subject: "1通目", gmail_message_id: `msg-c1-${seed}`, gmail_thread_id: `thr-c-${seed}`,
  });
  createSendLog({
    prospect_id: p.id, sender_id: sender.id, to_email: `info@ev-c-${seed}.zzz`,
    subject: "2通目（追客）", gmail_message_id: `msg-c2-${seed}`, gmail_thread_id: `thr-c-${seed}`,
  });
  const map = getSendEvidenceMap();
  check("通算回数が数えられる", map[p.id]?.count === 2, JSON.stringify(map[p.id]?.count));
  check("最新の記録が入る（idの大きい方）",
    map[p.id]?.latest.gmail_message_id === `msg-c2-${seed}`, String(map[p.id]?.latest.gmail_message_id));
  const rows = getSendEvidenceByProspect(p.id);
  check("詳細は新しい順に並ぶ", rows[0]?.gmail_message_id === `msg-c2-${seed}`);
}

// --- 4. 日時の解釈（ここを間違えると9時間ずれる） ---
{
  const d = parseDbDate("2026-07-22 12:49:00");
  check("DBの素の文字列はUTCとして読む", d?.toISOString() === "2026-07-22T12:49:00.000Z", String(d?.toISOString()));
  check("日本時間に直して表示する（12:49Z → 21:49 JST）",
    formatJst("2026-07-22 12:49:00", "dateTime").includes("21:49"),
    formatJst("2026-07-22 12:49:00", "dateTime"));
  check("ISO（Z付き）はそのまま信頼する",
    formatJst("2026-07-22T12:49:00Z", "dateTime").includes("21:49"));
  check("Gmailのepochミリ秒も日本時間で出せる",
    formatJstFromMs(Date.UTC(2026, 6, 22, 12, 49, 0)).includes("21:49"),
    formatJstFromMs(Date.UTC(2026, 6, 22, 12, 49, 0)));
  check("読めない値は空にせず元の文字列を返す", formatJst("なにか", "dateTime") === "なにか");
  check("null は空文字（画面で落ちない）", formatJst(null) === "");
  check("予約時刻と送信時刻のズレを分で出せる",
    diffMinutes("2026-07-22 12:52:00", "2026-07-22 12:49:00") === 3);
  check("片方が無ければ null（0分と誤表示しない）", diffMinutes("2026-07-22 12:52:00", null) === null);
}

// --- 5. サーバのTZ判定（素の文字列がUTCかどうかを診断できる） ---
{
  const now = getDbNow();
  check("DBの now を UTC / 現地の両方で取れる", Boolean(now.dbNowUtc && now.dbNowLocal));
  console.log(`   ℹ️ このマシン: dbNowUtc=${now.dbNowUtc} / dbNowLocal=${now.dbNowLocal}` +
    ` → 素の文字列は ${now.dbNowUtc === now.dbNowLocal ? "UTC" : "サーバ現地時刻"}`);
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILED"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
