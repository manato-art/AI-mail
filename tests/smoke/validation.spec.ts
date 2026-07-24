import { test, expect } from "@playwright/test";

/**
 * H3: 設定CRUDの必須バリデーション。空のまま保存させない（空データのPOST防止）。
 * バリデーション機構（native required / JS）に依存せず「保存APIが呼ばれない」ことで断定する。
 * 書き込みAPIは intercept して実DBを汚さない。
 */

test("S-SET-3a/H3: 人格は必須未入力なら保存APIを叩かない", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/personas", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    return route.continue();
  });

  await page.goto("/settings/personas");
  await page.getByRole("button", { name: "新規登録" }).first().click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await page.waitForTimeout(500);
  expect(posts, "空のまま保存APIを叩かない").toBe(0);
  // フォームは閉じず残っている（保存されていない）
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible();
});

test("S-SET-3b/H3: サービスは必須未入力なら保存APIを叩かない", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/services", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    return route.continue();
  });

  await page.goto("/settings/services");
  await page.getByRole("button", { name: "新規登録" }).first().click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await page.waitForTimeout(500);
  expect(posts, "空のまま保存APIを叩かない").toBe(0);
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible();
});
