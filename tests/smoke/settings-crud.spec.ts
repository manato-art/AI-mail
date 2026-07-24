import { test, expect } from "@playwright/test";

/**
 * H1 (S-SET-1) / H2 (S-SET-2): 設定CRUDの安全点（人格を代表として）。
 * - 新規はPOST / 編集はPUT+id（取り違えると新規のつもりで既存を上書き）
 * - 削除は必ずconfirm（誤削除でデータ消失）
 *
 * 書き込み系APIは intercept して実DBを汚さず、method/経路だけ検証する。
 * GET一覧は実サーバ（seedの人格1件）を使う。
 */

test("S-SET-1: 新規登録はPOST /api/personas で送る（既存を上書きしない）", async ({ page }) => {
  let method: string | null = null;
  await page.route("**/api/personas", (route) => {
    if (route.request().method() === "POST") {
      method = "POST";
      return route.fulfill({ status: 200, json: { id: 9001 } });
    }
    return route.continue(); // GET一覧は実サーバ
  });

  await page.goto("/settings/personas");
  await page.getByRole("button", { name: "新規登録" }).first().click();

  const boxes = page.getByRole("textbox");
  await boxes.nth(0).fill("新規テスト人格"); // 名前
  await boxes.nth(1).fill("テスト役職"); // 役職
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect.poll(() => method).toBe("POST");
});

test("S-SET-1b: 編集はPUT /api/personas/{id} で送る", async ({ page }) => {
  let url: string | null = null;
  await page.route("**/api/personas/*", (route) => {
    if (route.request().method() === "PUT") {
      url = route.request().url();
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    return route.continue();
  });

  await page.goto("/settings/personas");
  await page.getByRole("button", { name: "編集" }).first().click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect.poll(() => url).not.toBeNull();
  expect(url).toMatch(/\/api\/personas\/\d+$/);
});

test("S-SET-2: 削除はconfirmを出し、キャンセルすれば消さない／承認で消す", async ({ page }) => {
  let deleteCalls = 0;
  await page.route("**/api/personas/*", (route) => {
    if (route.request().method() === "DELETE") {
      deleteCalls++;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  // まずキャンセル → 削除されない
  await page.goto("/settings/personas");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "削除" }).first().click();
  await page.waitForTimeout(500);
  expect(deleteCalls, "キャンセルなら削除しない").toBe(0);

  // 次に承認 → 削除される
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "削除" }).first().click();
  await expect.poll(() => deleteCalls).toBe(1);
});
