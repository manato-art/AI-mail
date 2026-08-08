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
import { createService, getCompanyById, getContactByEmail, getService, isEmailSuppressed, upsertCompany, upsertContact, upsertSender } from "@/lib/db";
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

// ══ 2026-08-08 独立レビューが見つけたバグの再現テスト（修正後は全部通る） ══

// ── R1: 同名の別店（place_id無し・hp_url違い）は conflict ──
console.log("\n── R1: 同名別店の乗っ取り防止 ──");
const rSame = importStorePack({
  ...pack,
  hp_url: "http://another-group.example.jp/soba/",   // 同名・別のHP＝別の店
  lp_url: "https://preview.cypherone.co.jp/s/xxxxxxxxxxxxxxxxxxxx",
  email: "another@another-group.example.jp",
});
check("同名でもHPが違えば conflict（名前一致で救済しない）", rSame.outcome, "conflict");
check("元の店の分析が汚れていない",
  JSON.parse(getCompanyById(company.id)!.analysis_json).company_name, "そば処 高美亭本店");

// place_id が両方あって食い違う場合も conflict
const packP1 = { ...pack, company_name: "チェーン亭", place_id: "PLACE_A", email: "p1@chain.example.jp",
  hp_url: "http://chain.example.jp/a/", analysis: { ...pack.analysis, company_name: "チェーン亭" } };
check("place_id付きの店を取込", importStorePack(packP1).outcome, "imported");
const rP2 = importStorePack({ ...packP1, place_id: "PLACE_B", email: "p2@chain.example.jp",
  hp_url: "http://chain.example.jp/b/" });
check("同名・place_id違いは conflict", rP2.outcome, "conflict");

// ── R2: 既存連絡先の付け替え ──
console.log("\n── R2: 別会社に紐付いた既存連絡先 ──");
// 自動収集が作った「間違った紐付け」を再現
const wrongCo = upsertCompany({ name: "三和グループ（自動収集）", domain: "relink.example.jp", source: "auto_collection" });
upsertContact({ company_id: wrongCo.id, company_name: wrongCo.name, person_name: "",
  email: "relink@relink.example.jp", email_source_url: null, source: "auto_collection", lp_url: null });
const rRelink = importStorePack({
  ...pack, company_name: "付替茶屋", email: "relink@relink.example.jp",
  hp_url: "http://relink.example.jp/chaya/",
  lp_url: "https://preview.cypherone.co.jp/s/yyyyyyyyyyyyyyyyyyyy",
  analysis: { ...pack.analysis, company_name: "付替茶屋" },
});
check("取込は成功", rRelink.outcome, "imported");
check("連絡先が正しい会社へ付け替わる（自動収集の紐付けを上書き）",
  getContactByEmail("relink@relink.example.jp")?.company_id, rRelink.company_id);

// 2つのLP店が同じ受信箱を共有 → 機械で決めずに conflict
const rShared = importStorePack({
  ...pack, company_name: "共有受信箱の別店", email: "relink@relink.example.jp",
  hp_url: "http://relink.example.jp/another/",
  lp_url: "https://preview.cypherone.co.jp/s/zzzzzzzzzzzzzzzzzzzz",
  analysis: { ...pack.analysis, company_name: "共有受信箱の別店" },
});
check("LP店同士の受信箱共有は conflict", rShared.outcome, "conflict");
check("先の店のURLが残る（後勝ちで潰されない）",
  getContactByEmail("relink@relink.example.jp")?.lp_url, "https://preview.cypherone.co.jp/s/yyyyyyyyyyyyyyyyyyyy");

// ── R3: 型不正の analysis は例外でなく invalid ──
console.log("\n── R3: 型不正 ──");
check("company_name が数値 → invalid（例外でバッチを壊さない）",
  importStorePack({ ...pack, analysis: { company_name: 12345, business_summary: "x", hook: "y" } }).outcome, "invalid");

// ── R4: 禁止語の正規化バイパス ──
console.log("\n── R4: 禁止語の正規化 ──");
check("ゼロ幅スペース挟みでも検知", checkBannedPhrases("", "順​位が上がります", banned), ["順位"]);
check("全角英数もNFKCで検知", checkBannedPhrases("", "ｸﾁｺﾐ対策", parseBannedPhrases("クチコミ")), ["クチコミ"]);

// ── R5: AIゾーンの裸ドメイン拒否 ──
console.log("\n── R5: 裸ドメイン ──");
check("裸ドメインを拒否", checkZoneOutput("詳しくは phish-example.tk をご覧ください") !== null, true);
check("全角のURLも拒否", checkZoneOutput("こちら ｈｔｔｐｓ：／／ｘ．ｃｏｍ") !== null, true);
check("ドメインを含まない日本語は通す",
  checkZoneOutput("明治四十年のご創業から続く歴史を拝見しました。いまのホームページではその歩みが伝わりにくいように感じました。"), null);

// ── R6: 予約送信も停止スイッチに従う ──
console.log("\n── R6: 予約送信の停止 ──");
{
  const svcHalted = createService({ name: "停止商材", description: "x", strengths: "x", target: "x", send_halted: true });
  const svcRow = getService(svcHalted.id)!;
  check("createService が send_halted を保存する", svcRow.send_halted, 1);
  // スケジューラ本体は Gmail に触るため、ここでは「停止判定に使う値が取れること」までを固定し、
  // 分岐そのものは verify-scheduler（下）の静的確認に委ねる
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
