import { test, expect } from "@playwright/test";

/**
 * I1 (S-SEC-1): 設定画面はSerper APIキーを絶対に画面へ流し込まない。
 * 「設定済みか」のフラグだけ受け取り、入力欄は空・プレースホルダで示す設計。
 * 作り替えで既存キーを value に入れると漏洩退行になる。
 */
test("S-SEC-1: APIキーは設定済みでも画面に出さない（value空・設定済みプレースホルダ）", async ({ page }) => {
  // サーバがキー本体を返しても（本来返さないが念のため）UIが表示しないことを確認
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 200,
      json: {
        serper_api_key_configured: "true",
        serper_api_key: "sk-SECRET-should-never-render",
        search_mode: "api",
        test_mode: "false",
      },
    })
  );

  await page.goto("/settings");

  const keyInput = page.locator('input[type="password"]');
  await expect(keyInput).toBeVisible();
  await expect(keyInput).toHaveValue("");
  await expect(keyInput).toHaveAttribute("placeholder", /設定済み/);

  // 万一サーバがキーを返しても画面のどこにも出ていない
  await expect(page.locator("body")).not.toContainText("sk-SECRET-should-never-render");
});
