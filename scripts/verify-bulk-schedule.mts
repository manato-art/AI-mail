/**
 * まとめて予約(/api/prospects/bulk-schedule)の検証。
 * 1リクエストで複数prospectを予約状態にし、宛先無し・送信済みは理由付きで failed に入ることを確認。
 * （フロント直列ループの途中中断で「一部だけ予約済」になる問題を根本回避する経路）
 */
import {
  createService,
  createPersona,
  createProspect,
  upsertSender,
  updateSenderAuthStatus,
  updateProspectStatus,
  getProspect,
  getAllProspects,
} from "@/lib/db";
import { POST } from "@/app/api/prospects/bulk-schedule/route";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const seed = getAllProspects().length;
const svc = createService({ name: `bs-svc-${seed}`, description: "d", strengths: "s", target: "t" });
const persona = createPersona({
  name: "p", title: "t", gender: "", age_range: "30代", company_name: "c",
  signature_block: "sig", logic: 3, passion: 3, politeness: 3, salesiness: 3, length: 3,
});
const sender = upsertSender({
  email: `bs-sender-${seed}@example.co.jp`, display_name: "テスト太郎", google_refresh_token_encrypted: "dummy",
});
updateSenderAuthStatus(sender.id, "connected");

// 署名あり・未解決変数なし・送信元と別ドメイン → 送信ガードを通過する本文
const body =
  "ご提案の件でご連絡いたしました。ご検討のほどよろしくお願いいたします。\n" +
  "━━━━━━━━━━\n株式会社テスト 営業部\n〒100-0001 東京都千代田区\ninfo@test-sender.co.jp\n配信停止はこちら";

// analysis_json を空にして事実誤認検知はスキップ（予約機構そのものを検証するため）
function mk(email: string | null, status = "unsent"): number {
  const id = createProspect({
    input_url: "https://x", domain: email ? email.split("@")[1] : "noemail.zzz", company_name: `社${email ?? "無"}`,
    analysis_json: "", service_id: svc.id, persona_id: persona.id,
    subject: "ご提案の件", body, generated_subject: "ご提案の件", generated_body: body,
    emails_found_json: email ? JSON.stringify([email]) : null,
    form_url: null, is_form_only: 0, compatibility_score: "medium", has_refusal: 0, refusal_text: null,
    send_status: "unsent",
  } as never).id;
  if (status !== "unsent") updateProspectStatus(id, status);
  return id;
}

const p1 = mk(`c1-${seed}@sched-a.zzz`);
const p2 = mk(`c2-${seed}@sched-b.zzz`);
const p3 = mk(`c3-${seed}@sched-c.zzz`);
const pNoEmail = mk(null);
const pSent = mk(`c5-${seed}@sched-e.zzz`, "sent");

const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 明日

const req = new Request("http://localhost/api/prospects/bulk-schedule", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prospectIds: [p1, p2, p3, pNoEmail, pSent],
    senderId: sender.id,
    scheduledAt,
    acknowledgedWarnings: true,
  }),
});

const res = await POST(req as never);
const data = (await res.json()) as { scheduled: number; failed: { id: number; reason: string }[] };

check("HTTP 200", res.status === 200);
check("有効な3件が予約された（scheduled===3）", data.scheduled === 3);
check("p1 が scheduled 状態＋予定時刻あり",
  getProspect(p1)?.send_status === "scheduled" && !!getProspect(p1)?.scheduled_at);
check("p2 が scheduled 状態", getProspect(p2)?.send_status === "scheduled");
check("p3 が scheduled 状態", getProspect(p3)?.send_status === "scheduled");
check("宛先無しは failed に理由付きで入る",
  data.failed.some((f) => f.id === pNoEmail && /宛先メール/.test(f.reason)));
check("送信済みは failed（二重予約しない）",
  data.failed.some((f) => f.id === pSent && /送信済み/.test(f.reason)));
check("送信済み prospect は sent のまま（予約で上書きしない）", getProspect(pSent)?.send_status === "sent");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
