import { test, expect, type Page } from "@playwright/test";

/**
 * F1/F2/F3: 収集元の状態表示と操作の契約。
 * - 有効判定は is_active===1 かつ !paused_kind（複合）。ブロック中を「収集対象」と誤表示しない（F1）
 * - 自動停止(blocked)からの復帰は action:'resume' の別契約（通常トグルではない）（F2）
 * - 有効ソースが無ければ「今すぐ収集」はAPIを叩かない（F3）
 *
 * /api/collection/sources を intercept して状態を作る（status/services は実サーバのまま）。
 */

function source(over: Record<string, unknown>) {
  return {
    id: 0,
    source_type: "keyword_search",
    keyword: "キーワード",
    url: null,
    is_active: 1,
    paused_kind: null,
    paused_reason: null,
    last_run_at: null,
    service_id: null,
    created_at: "2026-07-24 10:00:00",
    ...over,
  };
}

async function openCollection(page: Page, sources: unknown[]) {
  await page.route("**/api/collection/sources", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: { sources, runs: [] } });
    }
    return route.continue();
  });
  await page.goto("/collection");
}

test("S-COL-1/F1・F2: ブロック中は『収集対象』にせず『再開する』を出し、resume契約でPATCHする", async ({ page }) => {
  let patchBody: Record<string, unknown> | null = null;
  await page.route("**/api/collection/sources/*", (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  await openCollection(page, [
    source({ id: 1, keyword: "アクティブKW", is_active: 1, paused_kind: null }),
    source({ id: 2, keyword: "ブロックKW", is_active: 1, paused_kind: "blocked", paused_reason: "3回連続0件で自動停止" }),
  ]);

  // まずソース行が描画されるのを待つ（負荷時の描画遅延で偽赤にしない）
  await expect(page.getByText("アクティブKW")).toBeVisible();
  await expect(page.getByText("ブロックKW")).toBeVisible();

  // F1: is_active=1 でも paused_kind があれば「収集対象」にならない → バッジは有効な1件だけ
  await expect(page.getByText("収集対象")).toHaveCount(1);
  // ブロック理由はそのまま表示
  await expect(page.getByText("3回連続0件で自動停止")).toBeVisible();
  // ブロック側は「再開する」、有効側は「一時停止」
  await expect(page.getByRole("button", { name: "再開する" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "一時停止" })).toHaveCount(1);

  // F2: 再開は action:'resume' の別契約
  await page.getByRole("button", { name: "再開する" }).click();
  await expect.poll(() => patchBody).not.toBeNull();
  expect(patchBody!.action).toBe("resume");
});

test("S-COL-3/F3: 有効な収集元が無ければ『今すぐ収集』はAPIを叩かない", async ({ page }) => {
  let runCalls = 0;
  await page.route("**/api/collection/run", (route) => {
    runCalls++;
    return route.fulfill({ status: 200, json: { started: true } });
  });

  // ブロック中のみ＝有効ソース0
  await openCollection(page, [
    source({ id: 2, keyword: "ブロックのみ", is_active: 1, paused_kind: "blocked", paused_reason: "自動停止" }),
  ]);

  await page.getByRole("button", { name: "今すぐ収集" }).click();
  await page.waitForTimeout(500);
  expect(runCalls, "有効ソース0なら収集APIを叩かない").toBe(0);
});

test("S-COL-5/F6: 収集元の削除は confirm を出し、キャンセルなら消さない", async ({ page }) => {
  let deletes = 0;
  await page.route("**/api/collection/sources/*", (route) => {
    if (route.request().method() === "DELETE") {
      deletes++;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  await openCollection(page, [source({ id: 1, keyword: "削除テストKW", is_active: 1, paused_kind: null })]);

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "削除" }).click();
  await page.waitForTimeout(400);
  expect(deletes, "キャンセルなら削除しない").toBe(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "削除" }).click();
  await expect.poll(() => deletes).toBe(1);
});
