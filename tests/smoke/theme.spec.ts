import { test, expect } from "@playwright/test";

/**
 * C6: テーマ切替が localStorage 'theme' と data-theme（配色機構の契約）に反映される。
 * 作り替えで配色機構の契約（localStorageキー・data-theme）を落とすとテーマ設定が無効化する。
 */
test("S-NAV-6/C6: テーマ切替が data-theme と localStorage に反映される", async ({ page }) => {
  await page.goto("/");

  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.getByRole("button", { name: "テーマ切替" }).click();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .not.toBe(before);

  const stored = await page.evaluate(() => localStorage.getItem("theme"));
  expect(["dark", "light"]).toContain(stored);
});
