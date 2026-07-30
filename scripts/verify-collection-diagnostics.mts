/**
 * 収集の進み具合の集計（getCollectionDiagnostics）を検証する。
 *
 * 2026-07-30: 収集元が300件以上あり「本当に巡回できているのか分からない」という報告。
 * 巡回は1件ずつ順番に回るので、件数が増えると1周期で全件に順番が来ない。
 * 「動いていない」と「順番待ち」を数字で見分けられることを守る。
 */
import {
  createCollectionSource,
  createWantedlyUrlSource,
  getCollectionDiagnostics,
  startCollectionRun,
  finishCollectionRun,
  updateCollectionCursor,
  pauseCollectionSource,
  getAllCollectionSources,
} from "@/lib/db";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, got?: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}${cond ? "" : `\n   → got: ${got}`}`);
  cond ? pass++ : fail++;
};

const seed = getAllCollectionSources().length;
const before = getCollectionDiagnostics();

// --- page 違いの同じ検索は「重複」として数える（巡回時に page は振り直されるため同一） ---
const base = `https://www.wantedly.com/projects?new=true&areas=tokyo&diag=${seed}`;
const dupA = createWantedlyUrlSource(`${base}&page=1`);
const dupB = createWantedlyUrlSource(`${base}&page=337`);
const dupC = createWantedlyUrlSource(`${base}&page=338`);
{
  const d = getCollectionDiagnostics();
  check("page違いの同じ検索を重複として数える",
    d.sources.duplicateUrlSources - before.sources.duplicateUrlSources === 3,
    String(d.sources.duplicateUrlSources - before.sources.duplicateUrlSources));
  check("重複の種類数も数える",
    d.sources.duplicateUrlGroups - before.sources.duplicateUrlGroups === 1,
    String(d.sources.duplicateUrlGroups - before.sources.duplicateUrlGroups));
}

// --- 別条件のURLは重複にしない（無関係な検索を巻き込まない） ---
{
  const other = createWantedlyUrlSource(`https://www.wantedly.com/projects?new=true&areas=osaka&diag=${seed}&page=5`);
  const d = getCollectionDiagnostics();
  check("条件が違うURLは重複扱いしない",
    d.sources.duplicateUrlGroups - before.sources.duplicateUrlGroups === 1,
    String(d.sources.duplicateUrlGroups - before.sources.duplicateUrlGroups));
  check("総数には数える", d.sources.total >= before.sources.total + 4 && other.id > 0);
}

// --- 一度も順番が来ていない収集元を数える ---
{
  const d = getCollectionDiagnostics();
  check("未実行（順番待ち）を数える",
    d.sources.neverRun >= 4, String(d.sources.neverRun));
  const stat = d.perSource.find((x) => x.id === dupA.id);
  check("未実行の収集元は巡回0回として出る", stat?.runs === 0 && stat?.lastRunAt === null,
    JSON.stringify(stat));
}

// --- 1件だけ実行させると、その1件だけが「走った」と分かる ---
{
  const runId = startCollectionRun(dupA.id, 1);
  finishCollectionRun(runId, { status: "success", foundCount: 40, newCount: 5, skippedCount: 35, skipBreakdown: {} });
  updateCollectionCursor(dupA.id, { nextPage: 3, consecutiveNoResultRuns: 0, consecutiveNoNewRuns: 0 });

  const d = getCollectionDiagnostics();
  // このDBは他の検証スクリプトと共用で、直近30分に他の実行記録が残っている場合がある。
  // 「今入れた1件が周期に数えられていること」と「周期の開始時刻が直近であること」で断定する。
  const startedRecently =
    !!d.lastCycle?.startedAt &&
    Date.now() - new Date(d.lastCycle.startedAt.replace(" ", "T") + "Z").getTime() < 60 * 60 * 1000;
  check("直近の巡回で走った件数が出る（今入れた1件を含む）",
    (d.lastCycle?.ranSources ?? 0) >= 1 && startedRecently, JSON.stringify(d.lastCycle));
  const stat = d.perSource.find((x) => x.id === dupA.id);
  check("どこまで進んだか（次のページ）が出る", stat?.nextPage === 3, String(stat?.nextPage));
  check("巡回回数が出る", stat?.runs === 1, String(stat?.runs));
  check("走っていない収集元は未実行のまま",
    d.perSource.find((x) => x.id === dupB.id)?.runs === 0);
  check("日別の実行数・取得・新規が出る",
    d.runsPerDay.length > 0 && d.runsPerDay[0].runs >= 1 && d.runsPerDay[0].found >= 40,
    JSON.stringify(d.runsPerDay[0]));
}

// --- 一時停止は「収集対象」から外れる（止まっているのに動いていると誤解させない） ---
{
  const activeBefore = getCollectionDiagnostics().sources.active;
  pauseCollectionSource(dupC.id, "exhausted", "テスト用の停止");
  const d = getCollectionDiagnostics();
  check("一時停止すると収集対象が1件減る", d.sources.active === activeBefore - 1,
    `${activeBefore} → ${d.sources.active}`);
  check("停止中として数える", d.sources.paused >= 1);
  check("停止理由が収集元ごとに出る",
    d.perSource.find((x) => x.id === dupC.id)?.pausedReason === "テスト用の停止");
}

// --- ラベル衝突で登録が500にならない（末尾だけ違うURLの回帰テスト） ---
{
  // 旧実装は base36 の先頭6文字だけをラベルに使っていたため、末尾の数字だけ違うURLが
  // 同じラベルに潰れて UNIQUE(keyword, site) 違反＝500 になっていた
  const tail = `https://www.wantedly.com/projects?areas=tokyo&diag=${seed}&page=`;
  const a = createWantedlyUrlSource(`${tail}337`);
  const b = createWantedlyUrlSource(`${tail}338`);
  check("末尾だけ違うURLも別々に登録できる（500にならない）", a.id !== b.id && b.id > 0,
    `${a.id} / ${b.id}`);
  check("同じURLの再登録は1件に集約される",
    createWantedlyUrlSource(`${tail}337`).id === a.id);
}

// --- キーワード収集元（URLなし）を重複判定に巻き込まない ---
{
  // 直前の状態と比べる（このDBは他スクリプトと共用なので、全体の絶対値では判定しない）
  const prev = getCollectionDiagnostics();
  const kw = createCollectionSource(`diag-kw-${getAllCollectionSources().length}`, "", "keyword_search", null);
  const d = getCollectionDiagnostics();
  check("URLを持たない収集元を足しても重複件数は増えない",
    d.sources.duplicateUrlSources === prev.sources.duplicateUrlSources &&
      d.sources.duplicateUrlGroups === prev.sources.duplicateUrlGroups,
    `${prev.sources.duplicateUrlSources}/${prev.sources.duplicateUrlGroups} → ${d.sources.duplicateUrlSources}/${d.sources.duplicateUrlGroups}`);
  check("キーワード収集元も進み具合の一覧に出る",
    d.perSource.some((x) => x.id === kw.id), String(kw.id));
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILED"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
