import { test, expect, type Page } from "@playwright/test";

/**
 * D1 / E1-E4: ダッシュボードの「クイック生成」フロー。
 *
 * 検証の重心はネットワーク契約（POST /api/generate の body と、応答4分岐ごとの遷移先）。
 * 外部(Claude)には到達させない＝/api/generate を intercept して作り物応答を返す。
 * 応答の形（success{prospect} / duplicate{existingProspect} / lowCompatibility / error）は
 * サーバのAPI契約そのもので、UIを作り替えても不変。
 */

async function fillQuickGenerate(page: Page, url = "https://example.co.jp") {
  await page.goto("/");
  const selects = page.locator("select");
  await selects.nth(0).selectOption({ label: "スモークサービス" }); // サービス
  await selects.nth(1).selectOption({ label: "テスト太郎" }); // 人格
  await page.locator('input[type="url"]').fill(url);
}

test("S-GEN-1: 生成リクエストに force:false / forceLow:false が必ず付く（ガード自動バイパス防止）", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/generate", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: { prospect: { id: 99001 }, qualityCheck: {} } });
  });

  await fillQuickGenerate(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();
  await page.waitForURL("**/prospect/99001");

  expect(body).not.toBeNull();
  expect(body!.force, "force は false で送る").toBe(false);
  expect(body!.forceLow, "forceLow は false で送る").toBe(false);
  expect(typeof body!.serviceId).toBe("number");
  expect(typeof body!.personaId).toBe("number");
  expect(String(body!.url)).toContain("example.co.jp");
});

test("S-GEN-2: 生成成功で /prospect/{id} へ遷移する", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 200, json: { prospect: { id: 91234 }, qualityCheck: {} } })
  );
  await fillQuickGenerate(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();
  await page.waitForURL("**/prospect/91234");
  expect(page.url()).toContain("/prospect/91234");
});

test("S-GEN-3: duplicate は再生成せず既存 /prospect/{existingId} へ飛ぶ", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 200, json: { duplicate: true, existingProspect: { id: 88002 } } })
  );
  await fillQuickGenerate(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();
  await page.waitForURL("**/prospect/88002");
  expect(page.url()).toContain("/prospect/88002");
});

test("S-GEN-4: lowCompatibility は警告なしで生成せず /generate?url= へ誘導する", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 200, json: { lowCompatibility: true, analysis: {} } })
  );
  await fillQuickGenerate(page, "https://lowcompat.example.jp");
  await page.getByRole("button", { name: "生成", exact: true }).click();
  await page.waitForURL("**/generate**");
  expect(page.url()).toContain("/generate");
  expect(page.url()).toContain("url=");
  // URLがクエリに引き継がれている（encodeURIComponent）
  expect(decodeURIComponent(page.url())).toContain("lowcompat.example.jp");
});

test("S-GEN-5: error 応答は握り潰さず画面にメッセージを出す（白画面にしない）", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 500, json: { error: "スモーク用の生成エラー", retryable: false } })
  );
  await fillQuickGenerate(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByText("スモーク用の生成エラー")).toBeVisible();
  expect(page.url()).not.toContain("/prospect/");
});
