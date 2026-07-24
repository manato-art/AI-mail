import { test, expect } from "@playwright/test";

/**
 * 設定画面のアクションと入力バリデーション。
 * - Gmail接続は /api/auth/gmail を叩いて返るURLへ遷移（Google連携の入口。中身は触らない）
 * - ログアウトは /api/auth/logout → /login
 * - 日次上限は整数・非負でなければ保存APIを叩かない
 * - 日程調整URLは https でなければ保存APIを叩かない
 */

test("S-SET-7: Gmail接続ボタンは /api/auth/gmail を叩く", async ({ page }) => {
  let called = 0;
  await page.route("**/api/auth/gmail", (route) => {
    called++;
    return route.fulfill({ status: 200, json: { url: "/" } }); // 同一サイトへ（外部Googleに飛ばさない）
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Gmailアカウントを接続" }).click();
  await expect.poll(() => called).toBe(1);
});

test("S-SET-8: ログアウトは /api/auth/logout を叩いて /login へ", async ({ page }) => {
  let posted = 0;
  await page.route("**/api/auth/logout", (route) => {
    posted++;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForURL("**/login");
  expect(posted).toBe(1);
});

test("S-SET-9: 日次上限が不正(負/小数)なら保存APIを叩かない", async ({ page }) => {
  let patches = 0;
  await page.route("**/api/senders", (route) => {
    if (route.request().method() === "PATCH") {
      patches++;
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    return route.continue();
  });
  await page.goto("/settings");

  const limit = page.locator('input[type="number"]').first();
  await limit.fill("-5");
  await limit.blur();
  await page.waitForTimeout(300);
  await limit.fill("1.5");
  await limit.blur();
  await page.waitForTimeout(300);
  expect(patches, "不正な上限は保存しない").toBe(0);
});

test("S-SET-10: 日程調整URLが https でなければ保存APIを叩かない", async ({ page }) => {
  let patches = 0;
  await page.route("**/api/senders", (route) => {
    if (route.request().method() === "PATCH") {
      patches++;
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    return route.continue();
  });
  await page.goto("/settings");

  const booking = page.getByPlaceholder(/calendly/i);
  await booking.fill("http://not-secure.example.com");
  await booking.blur();
  await page.waitForTimeout(300);
  expect(patches, "http は保存しない").toBe(0);
});
