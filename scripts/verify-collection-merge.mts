/**
 * 重複収集元のまとめ（mergeDuplicateUrlSources）を検証する。
 *
 * 2026-07-30: page= 違いの同じ検索が300件以上登録され、1件ずつ順番に回る巡回の行列が
 * 伸びて後ろに順番が来なくなっていた。まとめる際に守るべきこと:
 *  1. 一番進んでいる1件を残す（進捗を捨てない）
 *  2. 条件が違う検索は巻き込まない
 *  3. 集めた企業データは消さない
 *  4. 下見（dryRun）ではデータを触らない
 */
import {
  createWantedlyUrlSource,
  createCollectionSource,
  mergeDuplicateUrlSources,
  updateCollectionCursor,
  getCollectionSource,
  getAllCollectionSources,
  upsertCompany,
  getCompaniesWithTags,
} from "@/lib/db";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, got?: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}${cond ? "" : `\n   → got: ${got}`}`);
  cond ? pass++ : fail++;
};

const seed = getAllCollectionSources().length;
const base = `https://www.wantedly.com/projects?new=true&areas=tokyo&merge=${seed}`;

// 同じ検索（page違い）を3件 ＋ 条件違いを1件
const a = createWantedlyUrlSource(`${base}&page=1`);
const b = createWantedlyUrlSource(`${base}&page=337`);
const c = createWantedlyUrlSource(`${base}&page=338`);
const other = createWantedlyUrlSource(`https://www.wantedly.com/projects?new=true&areas=osaka&merge=${seed}&page=2`);
// URLを持たないキーワード収集元（巻き込まれてはいけない）
const kw = createCollectionSource(`merge-kw-${seed}`, "", "keyword_search", null);

// b を一番進んだ状態にする（残るのは b であるべき）
updateCollectionCursor(b.id, { nextPage: 47, consecutiveNoResultRuns: 0, consecutiveNoNewRuns: 0 });

// この収集元から集めた企業（まとめても消えてはいけない）
const company = upsertCompany({
  name: `まとめ検証社-${seed}`,
  domain: `merge-test-${seed}.zzz`,
  source: "collection",
  source_detail: "verify",
  hp_url: `https://merge-test-${seed}.zzz`,
  collection_source_id: c.id,
} as never);

// --- 4. 下見はデータを触らない ---
{
  const preview = mergeDuplicateUrlSources(true);
  check("下見で消える件数が分かる", preview.removed >= 2, String(preview.removed));
  check("下見では実際に消えない",
    getCollectionSource(a.id) !== undefined && getCollectionSource(c.id) !== undefined);
}

// --- 1〜3. 実行 ---
{
  const result = mergeDuplicateUrlSources(false);
  check("重複を消した件数を返す", result.removed >= 2, String(result.removed));

  check("一番進んでいる1件が残る（next_page=47 の b）", getCollectionSource(b.id) !== undefined);
  check("同じ検索の残りは消える",
    getCollectionSource(a.id) === undefined && getCollectionSource(c.id) === undefined,
    `a=${getCollectionSource(a.id) !== undefined} c=${getCollectionSource(c.id) !== undefined}`);
  check("残した1件の進捗はそのまま", getCollectionSource(b.id)?.next_page === 47,
    String(getCollectionSource(b.id)?.next_page));

  check("条件が違う検索は巻き込まない", getCollectionSource(other.id) !== undefined);
  check("キーワード収集元は巻き込まない", getCollectionSource(kw.id) !== undefined);

  const stillThere = getCompaniesWithTags().some((x) => x.id === company.id);
  check("集めた企業データは消えない", stillThere);
}

// --- 冪等性: もう一度実行しても何も起きない ---
{
  const again = mergeDuplicateUrlSources(false);
  const target = again.kept.find((k) => k.url.includes(`merge=${seed}`));
  check("まとめ済みなら再実行しても消さない", target === undefined, JSON.stringify(target));
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILED"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
