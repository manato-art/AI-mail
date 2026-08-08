/**
 * M2 Phase 1 の検証（2026-08-08）。実DB（一時ディレクトリ）で本物の関数を叩く。
 *   1. 店パック取込（lib/handoff.ts）— 実物の高美亭パックで
 *   2. V1: 同一ドメイン複数店舗で別店の分析を乗っ取らない
 *   3. V2: 自動enrichmentがLP由来分析を触らない
 *   4. 禁止語ガード・AIゾーン出力のURL拒否（V10）
 * 実行: DATABASE_DIR=$(mktemp -d) npx tsx scripts/verify-handoff.mts <店パックJSON>
 */
import { readFileSync } from "node:fs";
import { importStorePack } from "@/lib/handoff";
import { getCompanyById, getContactByEmail, isEmailSuppressed, upsertSender } from "@/lib/db";
import { runSendGuard, parseBannedPhrases, checkBannedPhrases } from "@/lib/send-guard";
import { checkZoneOutput } from "@/lib/compose";

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) console.log(`      得た値: ${JSON.stringify(got)}\n      期待  : ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// ── 1. 実物の店パックを取り込む ──
console.log("── 店パック取込（実物: 高美亭） ──");
const pack = JSON.parse(readFileSync(process.argv[2], "utf8"));
const r1 = importStorePack(pack);
check("取込が成功する", r1.outcome, "imported");
const contact = getContactByEmail(pack.email);
check("連絡先に専用URLが入る", contact?.lp_url, pack.lp_url);
const company = getCompanyById(contact!.company_id!)!;
check("分析の出所が 'lp' になる", company.analysis_source, "lp");
check("enrichment が done（pending に残ると自動調査に拾われる）", company.enrichment_status, "done");
check("hp_url が店のページに向く", company.hp_url, pack.hp_url);
check("分析にそば屋が入っている", JSON.parse(company.analysis_json).company_name, "そば処 高美亭本店");

// 再取込は上書き扱いで成功する（LP更新のたびに取り込み直せる）
check("同じ店の再取込は成功する", importStorePack(pack).outcome, "imported");

// ── 2. V1: 同一グループの別店が乗っ取らない ──
console.log("\n── V1: 同一ドメイン複数店舗 ──");
const r2 = importStorePack({
  ...pack,
  company_name: "そば処 高美亭本店", // 同名なら同じ店の更新として通る
  analysis: { ...pack.analysis, company_name: "そば処 高美亭本店" },
});
check("同名（同じ店）の更新は通る", r2.outcome, "imported");

// place_id 無し・別名・同じメール = 高美亭の company を名前で拾えないので新 company が立つ
const r3 = importStorePack({
  ...pack,
  company_name: "御代田キッチン",
  analysis: { ...pack.analysis, company_name: "御代田キッチン" },
  lp_url: "https://preview.cypherone.co.jp/s/other0000000000000000",
});
// 同じメールアドレスを共有しているため連絡先は1本。lp_url は後勝ちになる —
// これは「同一受信箱に2店分送る」状態で、そもそも運用で分けるべきケース。
// ここで大事なのは **高美亭の company の分析が汚れていない** こと
const companyAfter = getCompanyById(company.id)!;
check("別名の店を取り込んでも、元の店の分析が汚れない",
  JSON.parse(companyAfter.analysis_json).company_name, "そば処 高美亭本店");
check("別名の店は別 company になる（潰れない）", r3.company_id !== company.id, true);

// ── 3. DT-5: 営業お断り ──
console.log("\n── DT-5: 営業お断り ──");
const r4 = importStorePack({
  ...pack,
  company_name: "お断り軒",
  email: "no-sales@refusal.example.jp",
  email_refusal_notice: true,
});
check("抑止リストへ登録される", r4.outcome, "suppressed");
check("宛先が抑止対象になっている", !!isEmailSuppressed("no-sales@refusal.example.jp"), true);
check("連絡先は作られない", getContactByEmail("no-sales@refusal.example.jp"), undefined);

// ── 4. 壊れたパックは弾く ──
console.log("\n── 不正なパック ──");
check("分析が空だと invalid", importStorePack({ ...pack, analysis: {} }).outcome, "invalid");
check("lp_url が http だと invalid", importStorePack({ ...pack, lp_url: "http://x.example/" }).outcome, "invalid");
check("email 無しは invalid（推測しない）", importStorePack({ ...pack, email: "" }).outcome, "invalid");

// ── 5. 禁止語ガード ──
console.log("\n── 禁止語（商材別・force不可） ──");
const sender = upsertSender({ email: "sales@example.co.jp", display_name: "テスト", google_refresh_token_encrypted: "dummy" });
const BODY = "本文です。\n━━━━━━━━\n株式会社テスト 営業部\n配信停止はこちら";
const banned = parseBannedPhrases("順位\n口コミを増や\n勝手に");
check("パース結果", banned, ["順位", "口コミを増や", "勝手に"]);
check("検出", checkBannedPhrases("件名", "Googleマップの順位が上がります", banned), ["順位"]);
const guard = (body: string, force: boolean) =>
  runSendGuard({ toEmail: "a@target.co.jp", subject: "件名", body, senderId: sender.id, force, bannedPhrases: banned }).canSend;
check("禁止語あり → ブロック", guard(`${BODY}\n順位を上げましょう`, false), false);
check("禁止語あり・force → それでもブロック", guard(`${BODY}\n順位を上げましょう`, true), false);
check("禁止語なし → 通る", guard(BODY, true), true);

// ── 6. V10: AIゾーン出力のURL拒否 ──
console.log("\n── V10: AIゾーン出力 ──");
check("URL入りは拒否", checkZoneOutput("こちらをご覧ください https://attacker.example/") !== null, true);
check("www. 形式も拒否", checkZoneOutput("詳しくは www.attacker.example まで") !== null, true);
check("禁止語入りは拒否", checkZoneOutput("マップの順位も改善が見込めます", banned) !== null, true);
check("正常な一文は通る", checkZoneOutput("明治四十年のご創業から五代にわたって受け継がれてきたことを拝見しました。", banned), null);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
