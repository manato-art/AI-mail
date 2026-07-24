import { test, expect } from "@playwright/test";

/**
 * H4 (F22ガード): allow_attachments が OFF のテンプレートでは添付を選べない。
 * 「初回メールに資料添付しない」方針を構造的に守る仕掛け。
 * 作り替えでこの無効化を落とすと誤添付→サーバ422で全件失敗の事故になる。
 */
test("S-SET-4/H4: 添付許可OFFなら『資料を選ぶ』は操作不可・ONで操作可（F22ガード）", async ({ page }) => {
  await page.goto("/settings/templates");
  await page.getByRole("button", { name: "新規作成" }).first().click();

  const allow = page.getByRole("checkbox").first(); // このテンプレートで資料の添付を許可する
  const pickBtn = page.getByRole("button", { name: "資料を選ぶ" });

  // デフォルト値に依存せず、OFF状態を作ってから検証
  if (await allow.isChecked()) await allow.uncheck();
  await expect(pickBtn, "添付許可OFFなら操作不可").toBeDisabled();

  await allow.check();
  await expect(pickBtn, "添付許可ONで操作可").toBeEnabled();

  await allow.uncheck();
  await expect(pickBtn, "OFFに戻せば再び操作不可").toBeDisabled();
});

test("S-SET-5/H5: テンプレ保存は compose_mode='fixed_only' 固定で送る（旧hybrid破損防止）", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/templates", (route) => {
    if (route.request().method() === "POST") {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { id: 9001, name: "smoke", subject: "", body: "", compose_mode: "fixed_only", allow_attachments: 0, attachments: [] } });
    }
    return route.continue();
  });
  await page.route("**/api/templates/*/attachments", (route) =>
    route.fulfill({ status: 200, json: { id: 9001, attachments: [] } })
  );

  await page.goto("/settings/templates");
  await page.getByRole("button", { name: "新規作成" }).first().click();
  await page.getByPlaceholder("テンプレート名").fill("スモークテンプレ");
  await page.getByRole("button", { name: /保存/ }).click();

  await expect.poll(() => body).not.toBeNull();
  expect(body!.compose_mode).toBe("fixed_only");
});
