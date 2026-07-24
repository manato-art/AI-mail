import { test, expect } from "@playwright/test";

/**
 * C5: 一括送信の宛先リストは sessionStorage で永続し、リロードで消えない。
 * D9: 直接入力モードで生成したメールの「汎用文警告(#5)」がプレビューに表示される
 *     （送信時サーバ側{{AI:}}ゲートが不発なので、この表示が唯一の防波堤）。
 */

test("S-NAV-5/C5: 宛先リストはリロードしても保持される（sessionStorage永続）", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // 離脱警告(beforeunload)を許可
  await page.goto("/bulk-send");

  await page.getByRole("button", { name: "1件追加" }).click();
  await page.getByPlaceholder("株式会社○○").fill("永続テスト社");
  await page.getByPlaceholder("email@example.com").fill("persist@example.com");

  // sessionStorage への書き込みを待ってからリロード
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("bulk-send-recipients")))
    .toContain("persist@example.com");
  await page.reload();

  // 宛先が復元されている
  await expect(page.getByPlaceholder("email@example.com")).toHaveValue("persist@example.com");
  await expect(page.getByPlaceholder("株式会社○○")).toHaveValue("永続テスト社");
});

test("S-BULK-5/D9: 直接入力の生成メールで汎用文警告(#5)がプレビューに出る", async ({ page }) => {
  const WARN = "この文面は会社ごとの個別文になっていない可能性があります";
  await page.route("**/api/bulk-send/preview", (route) =>
    route.fulfill({ status: 200, json: { subject: "テスト件名", body: "汎用的な本文", warnings: [WARN] } })
  );

  await page.goto("/bulk-send");
  await page.getByRole("button", { name: "直接入力して送信" }).click();

  await page.getByPlaceholder("{{company_name}}様へのご提案").fill("テスト件名");
  await page.getByPlaceholder(/本文を入力/).fill("テスト本文 {{AI:提案してください}}");

  await page.getByRole("button", { name: "1件追加" }).click();
  await page.getByPlaceholder("株式会社○○").fill("D9テスト社");
  await page.getByPlaceholder("email@example.com").fill("d9@example.com");

  // 新規宛先は既定でチェック済み → そのまま生成
  await page.getByRole("button", { name: /選択した.*件を生成/ }).click();

  // 生成後、プレビューに汎用文警告が表示される
  await expect(page.getByText(WARN)).toBeVisible();
});
