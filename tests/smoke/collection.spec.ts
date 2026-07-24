import { test, expect } from "@playwright/test";

/**
 * F4 (S-COL-4): キーワード欄にURLを入れたら「収集元を作らない」ガード。
 * これを落とすと永久0件の無効ソースを量産する（実害対策）。
 * 収集元POSTは intercept して実DBを汚さず、呼ばれた/呼ばれないだけ検証する。
 */
function keywordInput(page: import("@playwright/test").Page) {
  return page.getByPlaceholder(/URLは不可/);
}

test("S-COL-4: キーワード欄にURLを入れても収集元POSTは飛ばない（誤入力ガード）", async ({ page }) => {
  let postCalls = 0;
  await page.route("**/api/collection/sources", (route) => {
    if (route.request().method() === "POST") {
      postCalls++;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  await page.goto("/collection");
  await keywordInput(page).fill("https://example.com/jobs");
  await page.getByRole("button", { name: "追加", exact: true }).click();

  await page.waitForTimeout(600);
  expect(postCalls, "URLはガードされPOSTしない").toBe(0);
});

test("S-COL-4b: 正しいキーワードなら収集元POSTが飛ぶ", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/collection/sources", (route) => {
    if (route.request().method() === "POST") {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { ok: true, id: 1 } });
    }
    return route.continue();
  });

  await page.goto("/collection");
  await keywordInput(page).fill("長期インターン エンジニア");
  await page.getByRole("button", { name: "追加", exact: true }).click();

  await expect.poll(() => body).not.toBeNull();
  expect(String(body!.keyword)).toContain("インターン");
});
