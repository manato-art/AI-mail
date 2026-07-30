import { test, expect } from "@playwright/test";

/**
 * 収集の「進み具合」表示。
 *
 * 収集元は1件ずつ順番に巡回するため、件数が増えると1周期で全件に順番が来ない。
 * 「動いていない」のか「順番待ち」なのかを画面で見分けられることを検証する。
 */
const SOURCES = [
  {
    id: 701, keyword: "Wantedly:aaa", site: "wantedly.com", source_type: "wantedly_url",
    url: "https://www.wantedly.com/projects?areas=tokyo&page=337", service_id: null,
    is_active: 1, next_page: 7, last_run_at: "2026-07-30 00:53:00",
    consecutive_no_result_runs: 0, consecutive_no_new_runs: 0, paused_reason: "", paused_kind: "",
    created_at: "2026-07-28 01:00:00",
  },
  {
    id: 702, keyword: "Wantedly:bbb", site: "wantedly.com", source_type: "wantedly_url",
    url: "https://www.wantedly.com/projects?areas=tokyo&page=338", service_id: null,
    is_active: 1, next_page: 0, last_run_at: null,
    consecutive_no_result_runs: 0, consecutive_no_new_runs: 0, paused_reason: "", paused_kind: "",
    created_at: "2026-07-28 01:00:00",
  },
];

const DIAG = {
  sources: { total: 302, active: 300, paused: 2, neverRun: 298, ranLast24h: 2, duplicateUrlGroups: 1, duplicateUrlSources: 300 },
  lastCycle: { startedAt: "2026-07-30 00:53:00", finishedAt: "2026-07-30 00:53:40", ranSources: 2 },
  runsPerDay: [{ day: "2026-07-30", runs: 3, found: 114, newCount: 8 }],
  perSource: [
    { id: 701, label: "Wantedly:aaa", sourceType: "wantedly_url", isActive: true, pausedReason: "", nextPage: 7, lastRunAt: "2026-07-30 00:53:00", runs: 3, companies: 42 },
    { id: 702, label: "Wantedly:bbb", sourceType: "wantedly_url", isActive: true, pausedReason: "", nextPage: 0, lastRunAt: null, runs: 0, companies: 0 },
  ],
  lastJobFinishedAt: "2026-07-30 00:53:40",
};

test("S-COL-DIAG-1: 順番待ちと重複を数字で見せる（動いていないと誤解させない）", async ({ page }) => {
  await page.route("**/api/collection/sources", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, json: { sources: SOURCES, runs: [] } })
      : route.continue()
  );
  await page.route("**/api/collection/diagnostics", (route) => route.fulfill({ status: 200, json: DIAG }));

  await page.goto("/collection");

  // 収集元の総数と、直近の巡回で順番が来た件数
  await expect(page.getByText(/収集元 302件（収集対象 300/)).toBeVisible();
  await expect(page.getByText(/直近の巡回で順番が来たのは/)).toBeVisible();
  await expect(page.getByText(/まだ一度も順番が来ていない: ?298/)).toBeVisible();

  // page違いの重複を警告する（これが順番待ちを長くしている原因）
  await expect(page.getByText(/同じ検索が重複して登録されています/)).toBeVisible();
  await expect(page.getByText(/300件 \/ 1種類/)).toBeVisible();

  // 収集対象300件に対し2件しか回れていないことを明示
  await expect(page.getByText(/1回の巡回で回れたのは 2件/)).toBeVisible();
});

test("S-COL-DIAG-2: 収集元ごとに「どこまで進んだか」と「順番待ち」を出す", async ({ page }) => {
  await page.route("**/api/collection/sources", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, json: { sources: SOURCES, runs: [] } })
      : route.continue()
  );
  await page.route("**/api/collection/diagnostics", (route) => route.fulfill({ status: 200, json: DIAG }));

  await page.goto("/collection");

  // 走った収集元: 何ページ目まで・何社・何回
  await expect(page.getByText(/7ページ目まで進行 ・ ここから 42社 ・ 巡回3回/)).toBeVisible();
  // まだ順番が来ていない収集元
  await expect(page.getByText("まだ順番が来ていません（次回以降に巡回します）")).toBeVisible();
});
