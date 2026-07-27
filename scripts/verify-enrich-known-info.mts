/**
 * 「既に手元にある情報」を壊さないことの検証（実害30%の構造バグ）。
 *
 * これまでは、メールもHPも分かっている企業に対してシステムがもう一度ゼロから
 * 社名検索をしに行き、その検索が失敗すると元々持っていた正しい情報ごと
 * 「調査できず」の札を貼っていた。ここでは次を確認する:
 *   1. HPが分かっている企業は検索を1回も呼ばずにクロールから再開する
 *   2. 有効な連絡先を持つ企業は failed に落ちない
 *   3. 見つけた問い合わせフォームのURLが保存される（従来は捨てていた）
 *   4. 取り込み時の状態（HPあり=調査済み / メールのみ=調査対象のまま）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dnsPromises from "node:dns/promises";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mail-known-"));
process.env.DATABASE_DIR = tmpDir;
process.env.SERPER_API_KEY = "";
process.env.GEMINI_API_KEY = "";

const {
  getCompanyById,
  importCompaniesWithContacts,
  markCompanyEnrichmentFailed,
  setSetting,
  upsertCompany,
  upsertContact,
} = await import("@/lib/db");
const { runEnrichmentBatch } = await import("@/lib/enrichment");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// 検索が壊れている状態を再現する（キー未設定＝呼べば必ず失敗する）
setSetting("search_mode", "api");
setSetting("serper_api_key", "");

const realLookup = dnsPromises.lookup;
(dnsPromises as unknown as { lookup: unknown }).lookup = async () => [
  { address: "203.0.113.10", family: 4 },
];

const KNOWN_HOST = "known-company.example.com";
const PAGE_HTML = `<!doctype html><html><head><title>テスト商事</title></head><body>
  <h1>テスト商事</h1>
  <p>テスト商事は検証用の会社です。</p>
  <form action="/inquiry" method="post"><input name="q" /><button>送信</button></form>
</body></html>`;

const realFetch = globalThis.fetch;
let searchCalls = 0;
const crawledUrls: string[] = [];
globalThis.fetch = (async (input: unknown) => {
  const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
  if (url.includes("google.serper.dev") || url.includes("duckduckgo.com")) {
    searchCalls++;
    return new Response(JSON.stringify({ organic: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  crawledUrls.push(url);
  return new Response(PAGE_HTML, { status: 200, headers: { "content-type": "text/html" } });
}) as unknown as typeof fetch;

// ============ 1〜3. HP既知の企業を調査する ============
// enrichment_status を明示して「HPは分かっているが未調査」という状態を作る
const known = upsertCompany({
  name: "テスト商事",
  source: "test",
  hp_url: `https://${KNOWN_HOST}/`,
  enrichment_status: "pending",
});

const result = await runEnrichmentBatch(1);
const after = getCompanyById(known.id);

check("HP既知なら検索を1回も呼ばない", searchCalls === 0);
check("検索の代わりに既知のHPをクロールする",
  crawledUrls.some((u) => u.includes(KNOWN_HOST)));
check("検索が壊れていても調査が完了する", after?.enrichment_status === "done" && result.failed === 0);
check("問い合わせフォームのURLが保存される", !!after?.form_url);
check("フォームURLが実際のページを指している", (after?.form_url ?? "").includes(KNOWN_HOST));

// ============ 4. 連絡先を持つ企業は failed に落とさない ============
const withContact = upsertCompany({ name: "連絡先あり社", source: "test" });
upsertContact({
  company_id: withContact.id,
  company_name: "連絡先あり社",
  email: "info@contact-kept.example.jp",
  source: "test",
});

markCompanyEnrichmentFailed(withContact.id, "公式サイトを特定できませんでした", "hp_not_found");
const keptCompanySpecific = getCompanyById(withContact.id);
check("連絡先があれば企業固有の失敗でも failed にしない",
  keptCompanySpecific?.enrichment_status !== "failed");
check("その場合は done を維持する", keptCompanySpecific?.enrichment_status === "done");
check("理由は記録される（握り潰さない）",
  !!keptCompanySpecific?.enrichment_error && keptCompanySpecific?.error_kind === "hp_not_found");

const withContact2 = upsertCompany({ name: "連絡先あり社2", source: "test" });
upsertContact({
  company_id: withContact2.id,
  company_name: "連絡先あり社2",
  email: "info@contact-kept2.example.jp",
  source: "test",
});
markCompanyEnrichmentFailed(withContact2.id, "検索がブロックされました", "search_blocked");
const keptInfra = getCompanyById(withContact2.id);
check("基盤起因なら状態を動かさない（復旧後に再調査できる）",
  keptInfra?.enrichment_status === "pending" && keptInfra?.error_kind === "search_blocked");

const noContact = upsertCompany({ name: "連絡先なし社", source: "test" });
markCompanyEnrichmentFailed(noContact.id, "公式サイトを特定できませんでした", "hp_not_found");
check("連絡先が無い企業は従来どおり failed",
  getCompanyById(noContact.id)?.enrichment_status === "failed");

// ============ 5. 取り込み時の状態 ============
importCompaniesWithContacts(
  [
    { name: "取込HPあり社", hp_url: "https://imported-hp.example.jp/", email: "a@imported-hp.example.jp" },
    { name: "取込メールのみ社", email: "b@imported-mail.example.jp" },
  ],
  "csv_import",
  "取込テスト"
);
const importedWithHp = getCompanyById(
  upsertCompany({ name: "取込HPあり社", source: "csv_import" }).id
);
const importedMailOnly = getCompanyById(
  upsertCompany({ name: "取込メールのみ社", source: "csv_import" }).id
);
check("HPありで取り込んだ企業は再検索の対象にしない（done）",
  importedWithHp?.enrichment_status === "done");
check("メールだけの企業はHP特定の余地があるので pending のまま",
  importedMailOnly?.enrichment_status === "pending");

globalThis.fetch = realFetch;
(dnsPromises as unknown as { lookup: unknown }).lookup = realLookup;
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* Windows ではDBを開いたまま消せないことがある。一時ディレクトリなので放置してよい */
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
