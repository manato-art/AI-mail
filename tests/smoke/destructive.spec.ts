import { test, expect } from "@playwright/test";

/**
 * 取り返しのつかない操作の確認ガード（データ損失防止）。
 * - 履歴全削除は confirm＋マジック文字列 DELETE_ALL_PROSPECTS が安全弁（H7）
 * - 送信しないリストの削除は法令面。confirm 無しに消さない
 * 破壊系APIは intercept して実DBを汚さず、confirmキャンセルで呼ばれないことを確認する。
 */

test("S-SET-6/H7: 生成履歴の全削除は confirm＋マジック文字列で守られる", async ({ page }) => {
  let deleteBody: Record<string, unknown> | null = null;
  await page.route("**/api/prospects", (route) => {
    if (route.request().method() === "DELETE") {
      deleteBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { ok: true, deleted: 0 } });
    }
    return route.continue();
  });

  await page.goto("/settings");

  // キャンセル → 削除しない
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "生成履歴をすべて削除" }).click();
  await page.waitForTimeout(400);
  expect(deleteBody, "キャンセルなら削除APIを叩かない").toBeNull();

  // 承認 → DELETE がマジック文字列付きで飛ぶ
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "生成履歴をすべて削除" }).click();
  await expect.poll(() => deleteBody).not.toBeNull();
  expect(deleteBody!.confirm).toBe("DELETE_ALL_PROSPECTS");
});

test("S-SUP-2: 送信しないリストの削除は confirm を出し、キャンセルなら消さない", async ({ page }) => {
  let deletes = 0;
  await page.route("**/api/suppressions", (route) => {
    const m = route.request().method();
    if (m === "GET") {
      return route.fulfill({
        status: 200,
        json: [
          { id: 1, target: "del@example.com", target_type: "email", reason: "manual", note: "テスト", created_at: "2026-07-24 10:00:00" },
        ],
      });
    }
    if (m === "DELETE") {
      deletes++;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  await page.goto("/settings/suppressions");
  await expect(page.getByText("del@example.com")).not.toHaveCount(0);

  // キャンセル → 消さない
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "リストから外す" }).click();
  await page.waitForTimeout(400);
  expect(deletes, "キャンセルなら削除しない").toBe(0);

  // 承認 → 消す
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "リストから外す" }).click();
  await expect.poll(() => deletes).toBe(1);
});
