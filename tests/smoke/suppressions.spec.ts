import { test, expect } from "@playwright/test";

/**
 * 法令遵守（特定電子メール法）機能の登録まわり。
 * - 追加は正しい契約(POST /api/suppressions with target/target_type/reason/note)で飛ぶ
 * - 理由の手動選択は SELECTABLE_REASONS(optout/rejected_reply/manual)に限定（I4。自動理由 bounce/refusal は選ばせない）
 */

test("S-SUP-1: 送信しないリストへの追加が正しい契約でPOSTされる", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/suppressions", (route) => {
    const m = route.request().method();
    if (m === "POST") {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { id: 9, target: (body as { target: string }).target, target_type: "email", reason: "manual", note: "", created_at: "2026-07-24 10:00:00" } });
    }
    if (m === "GET") return route.fulfill({ status: 200, json: [] });
    return route.continue();
  });

  await page.goto("/settings/suppressions");
  await page.getByPlaceholder("info@example.com").fill("block@example.com");
  await page.getByRole("button", { name: "リストに追加" }).click();

  await expect.poll(() => body).not.toBeNull();
  expect(body!.target).toBe("block@example.com");
  expect(body!.target_type).toBe("email");
  expect(["optout", "rejected_reply", "manual"]).toContain(body!.reason);
});

test("S-SUP-3/I4: 手動の理由選択は3種に限定され、自動理由(bounce/refusal)は出ない", async ({ page }) => {
  await page.route("**/api/suppressions", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, json: [] }) : route.continue()
  );
  await page.goto("/settings/suppressions");

  const reasonSelect = page.locator("select");
  await expect(reasonSelect).toBeVisible();
  await expect(reasonSelect.locator("option")).toHaveCount(3);
  const values = await reasonSelect.locator("option").evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value)
  );
  expect(values.sort()).toEqual(["manual", "optout", "rejected_reply"]);
  expect(values).not.toContain("bounce");
  expect(values).not.toContain("refusal_detected");
});
