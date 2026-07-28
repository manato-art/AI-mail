/**
 * 掲載URLの補充を検証する。
 *
 * 掲載URLを保存する前に集めた企業は listing_url が空で、裏処理が毎回「社名で検索」に
 * 落ちる。検索が止まっていると永久に調査できない（2026-07-27 本番の238社が該当）。
 * 媒体に再び出てきた時に掲載URLだけ埋めて、直取り経路へ乗せられることを固定する。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dbDir = mkdtempSync(join(tmpdir(), "backfill-"));
process.env.DATABASE_DIR = dbDir;
process.env.COLLECTION_SCHEDULE_DISABLED = "1";

const { upsertCompany, findCompanyByName, setCompanyListingUrl } = await import("@/lib/db");

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

// 掲載URL保存前に集めた企業（listing_url が空）
upsertCompany({
  name: "旧収集テスト社", domain: null, source: "auto_collection",
  source_detail: "Wantedly 新着 / wantedly.com", hp_url: null, lp_url: null,
  recruit_page_url: null, listing_url: null, collection_source_id: null,
} as never);

const before = findCompanyByName("旧収集テスト社");
check("補充前は掲載URLが空", !(before?.listing_url ?? "").trim());

setCompanyListingUrl(before!.id, "https://www.wantedly.com/companies/example-co");
const after = findCompanyByName("旧収集テスト社");
check(
  "【本命】媒体に再登場した時に掲載URLが補充される",
  after?.listing_url === "https://www.wantedly.com/companies/example-co",
  `listing_url=${after?.listing_url}`
);

// 既に入っている企業は上書きしない（後から拾った雑なURLで正準キーを壊さない）
setCompanyListingUrl(after!.id, "https://www.wantedly.com/companies/WRONG");
const kept = findCompanyByName("旧収集テスト社");
check(
  "既に掲載URLがある企業は上書きしない",
  kept?.listing_url === "https://www.wantedly.com/companies/example-co",
  `listing_url=${kept?.listing_url}`
);

console.log(`\n${pass} passed, ${fail} failed`);
try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* 一時ディレクトリの後始末 */ }
process.exit(fail > 0 ? 1 : 0);
