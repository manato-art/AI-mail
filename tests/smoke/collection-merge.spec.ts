import { test, expect } from "@playwright/test";

/**
 * 重複収集元の「1件にまとめる」操作。
 *
 * 破壊的な操作なので契約は3つ:
 *  - 先に件数を下見して confirm を出す（黙って消さない）
 *  - キャンセルしたら DELETE 相当の POST を投げない
 *  - 実行時は合言葉付きで POST する（誤爆防止）
 */
const SOURCES = [
  {
    id: 801, keyword: "Wantedly:aaa", site: "wantedly.com", source_type: "wantedly_url",
    url: "https://www.wantedly.com/projects?areas=tokyo&page=337", service_id: null,
    is_active: 1, next_page: 47, last_run_at: "2026-07-30 00:53:00",
    consecutive_no_result_runs: 0, consecutive_no_new_runs: 0, paused_reason: "", paused_kind: "",
    created_at: "2026-07-28 01:00:00",
  },
];

const DIAG = {
  sources: { total: 300, active: 300, paused: 0, neverRun: 298, ranLast24h: 2, duplicateUrlGroups: 1, duplicateUrlSources: 299 },
  lastCycle: { startedAt: "2026-07-30 00:53:00", finishedAt: "2026-07-30 00:53:40", ranSources: 2 },
  runsPerDay: [],
  perSource: [{ id: 801, label: "Wantedly:aaa", sourceType: "wantedly_url", isActive: true, pausedReason: "", nextPage: 47, lastRunAt: "2026-07-30 00:53:00", runs: 3, companies: 42 }],
  lastJobFinishedAt: "2026-07-30 00:53:40",
};

async function setup(page: import("@playwright/test").Page, onPost: () => void) {
  await page.route("**/api/collection/sources", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, json: { sources: SOURCES, runs: [] } })
      : route.continue()
  );
  await page.route("**/api/collection/diagnostics", (route) => route.fulfill({ status: 200, json: DIAG }));
  await page.route("**/api/collection/sources/merge-duplicates", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: { groups: 1, willRemove: 298, keep: [] } });
    }
    onPost();
    const body = route.request().postDataJSON();
    // 合言葉が無ければサーバは拒否する（ここでも契約を確認する）
    if (body?.confirm !== "MERGE_DUPLICATE_SOURCES") {
      return route.fulfill({ status: 400, json: { error: "確認キーが一致しないため中止しました" } });
    }
    return route.fulfill({ status: 200, json: { ok: true, groups: 1, removed: 298, keep: [] } });
  });
  await page.goto("/collection");
}

test("S-COL-MRG-1: まとめる前に件数を見せ、キャンセルなら何もしない", async ({ page }) => {
  let posts = 0;
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });

  await setup(page, () => posts++);
  await page.getByRole("button", { name: "重複を1件にまとめる" }).click();

  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("298件を削除");
  expect(dialogs[0]).toContain("集めた企業データは消えません");
  await page.waitForTimeout(500);
  expect(posts, "キャンセルしたら実行しない").toBe(0);
});

test("S-COL-MRG-2: 承諾したら合言葉付きで実行し、結果を伝える", async ({ page }) => {
  let posts = 0;
  page.on("dialog", (d) => d.accept());

  await setup(page, () => posts++);
  await page.getByRole("button", { name: "重複を1件にまとめる" }).click();

  await expect.poll(() => posts, { timeout: 15_000 }).toBe(1);
  await expect(page.getByText(/298件をまとめました/)).toBeVisible();
});
