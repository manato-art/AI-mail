/**
 * CSV一括登録のトランザクション検証。
 * importCompaniesWithContacts が (1)正しい件数を返し (2)ドメイン/メールで重複排除し
 * (3)途中の行で例外が出たら全体をロールバック（部分登録を残さない）ことを確認する。
 */
import {
  importCompaniesWithContacts,
  getAllCompanies,
  getAllContacts,
  type ImportRow,
} from "@/lib/db";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// テスト実行ごとに衝突しないよう、既存件数から一意なドメインを作る
const seed = getAllCompanies().length;
const dom = (s: string) => `imptx-${seed}-${s}.example.com`;

// 1. ハッピーパス: 3社（うち1社は連絡先あり）
const rows1: ImportRow[] = [
  { name: "取込A商店", domain: dom("a"), email: `a${seed}@example.com`, person_name: "田中" },
  { name: "取込B商店", domain: dom("b") },
  { name: "  ", domain: dom("blank") }, // 空名はスキップ
];
const r1 = importCompaniesWithContacts(rows1, "csv_import", "テスト取込");
check("新規企業2社を登録", r1.companiesAdded === 2);
check("連絡先1件を登録", r1.contactsAdded === 1);
check("空名の1行はスキップ", r1.skipped === 1);
check("A商店が実際にDBにある", getAllCompanies().some((c) => c.domain === dom("a")));

// 2. 重複排除: 同一ドメイン・同一メールは再登録されない
const rows2: ImportRow[] = [
  { name: "取込A商店(再)", domain: dom("a"), email: `a${seed}@example.com` }, // 既存ドメイン+既存メール
  { name: "取込C商店", domain: dom("c") }, // これだけ新規
];
const r2 = importCompaniesWithContacts(rows2, "csv_import", "テスト取込2");
check("重複ドメインは加算されず新規1社のみ", r2.companiesAdded === 1);
check("重複メールは連絡先追加されない", r2.contactsAdded === 0);

// 3. ロールバック: 途中の行で例外 → それ以前の行も含め全て未登録
const companiesBefore = getAllCompanies().length;
const contactsBefore = getAllContacts().length;
const boom: ImportRow = {
  // name ゲッターがトランザクション内で例外を投げる
  get name(): string {
    throw new Error("intentional row failure");
  },
} as ImportRow;
const rows3: ImportRow[] = [
  { name: "ロールバックX商店", domain: dom("x"), email: `x${seed}@example.com` },
  { name: "ロールバックY商店", domain: dom("y") },
  boom, // 3行目で例外
];
let threw = false;
try {
  importCompaniesWithContacts(rows3, "csv_import", "ロールバックテスト");
} catch {
  threw = true;
}
check("途中失敗で例外が伝播する", threw);
check("ロールバックで企業件数が増えていない", getAllCompanies().length === companiesBefore);
check("ロールバックで連絡先件数が増えていない", getAllContacts().length === contactsBefore);
check("失敗前の行(X商店)も登録されていない", !getAllCompanies().some((c) => c.domain === dom("x")));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
