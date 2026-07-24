import { test, expect } from "@playwright/test";

/**
 * 履歴の予約取消は confirm を出し、キャンセルなら取り消さない（誤操作で予約が消えない）。
 */
const SCHEDULED = [
  {
    id: 7100,
    input_url: "https://s.example.jp",
    domain: "s.example.jp",
    company_name: "予約テスト社",
    analysis_json: "{}",
    service_id: 1,
    persona_id: 1,
    subject: "件名",
    body: "",
    generated_subject: "",
    generated_body: "",
    emails_found_json: "[]",
    form_url: "",
    is_form_only: 0,
    compatibility_score: "medium",
    has_refusal: 0,
    refusal_text: null,
    template_id: null,
    send_status: "scheduled",
    scheduled_at: "2026-08-01 09:00:00",
    created_at: "2026-07-24 10:00:00",
  },
];

test("S-LIST-7: 予約取消は confirm を出し、キャンセルなら取り消さない", async ({ page }) => {
  let cancels = 0;
  await page.route("**/api/prospects", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, json: SCHEDULED }) : route.continue()
  );
  await page.route("**/api/prospects/*/cancel-schedule", (route) => {
    cancels++;
    return route.fulfill({ status: 200, json: { ok: true } });
  });

  await page.goto("/history");
  await expect(page.getByText("予約テスト社")).not.toHaveCount(0);

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "予約取消" }).click();
  await page.waitForTimeout(400);
  expect(cancels, "キャンセルなら取り消さない").toBe(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "予約取消" }).click();
  await expect.poll(() => cancels).toBe(1);
});
