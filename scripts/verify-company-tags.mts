/**
 * ①企業タグ付けの検証: キーワード登録時に商材を紐付け→企業登録→
 * getCompaniesWithTags でキーワード・商材名がタグとして取れることを確認する。
 */
import {
  createService,
  createCollectionSource,
  upsertCompany,
  getCompaniesWithTags,
} from "@/lib/db";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// 商材を2つ作る
const svcA = createService({ name: "きっかけインターン", description: "d", strengths: "s", target: "t" });
const svcB = createService({ name: "店舗LP制作", description: "d", strengths: "s", target: "t" });

// キーワード登録時に商材を紐付ける
const srcA = createCollectionSource("インターン", "wantedly.com", "keyword_search", svcA.id);
const srcB = createCollectionSource("飲食店 開業", "", "keyword_search", svcB.id);
check("collection_source に service_id が保存される", srcA.service_id === svcA.id);

// 企業をそれぞれのキーワード由来で登録
upsertCompany({ name: "A社", domain: "a.example.com", source: "auto_collection", collection_source_id: srcA.id });
upsertCompany({ name: "B社", domain: "b.example.com", source: "auto_collection", collection_source_id: srcB.id });
// タグなし（手動追加相当）
upsertCompany({ name: "C社", domain: "c.example.com", source: "manual" });

const tagged = getCompaniesWithTags();
const a = tagged.find((c) => c.name === "A社");
const b = tagged.find((c) => c.name === "B社");
const c = tagged.find((c) => c.name === "C社");

check("A社にキーワード『インターン』が付く", a?.collection_keyword === "インターン");
check("A社に商材『きっかけインターン』が付く", a?.collection_service_name === "きっかけインターン");
check("B社に商材『店舗LP制作』が付く", b?.collection_service_name === "店舗LP制作");
check("タグなしのC社は keyword/service が null", c?.collection_keyword === null && c?.collection_service_name === null);

// 絞り込みの動作（クライアント側filterと同等の確認）
const byKeyword = tagged.filter((c) => c.collection_keyword === "インターン");
check("キーワード絞り込みでA社だけ残る", byKeyword.length === 1 && byKeyword[0].name === "A社");
const byService = tagged.filter((c) => c.collection_service_id === svcB.id);
check("商材絞り込みでB社だけ残る", byService.length === 1 && byService[0].name === "B社");

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
