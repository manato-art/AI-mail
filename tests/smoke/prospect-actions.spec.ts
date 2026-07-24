import { test, expect, type Page } from "@playwright/test";

/**
 * プロスペクト詳細のアクション。
 * - ステータス変更は PUT /api/prospects/{id}/status で送る
 * - 「送信しないリストに追加」は confirm を出し、キャンセルなら登録しない
 */
const PID = 5100;

function cannedProspect() {
  return {
    id: PID,
    input_url: "https://acme2.example.jp",
    domain: "acme2.example.jp",
    company_name: "Acme2（テスト）",
    analysis_json: JSON.stringify({ company_name: "Acme2", business_summary: "x", activities: [], recent_topics: [], compatibility: { score: "medium", reason: "r" }, proposal_points: [], hook: "h" }),
    service_id: 1,
    persona_id: 1,
    subject: "件名",
    body: "本文本文本文",
    generated_subject: "",
    generated_body: "",
    emails_found_json: JSON.stringify(["a@acme2.example.jp"]),
    form_url: "",
    is_form_only: 0,
    compatibility_score: "medium",
    has_refusal: 0,
    refusal_text: null,
    template_id: null,
    send_status: "unsent",
    scheduled_at: null,
    created_at: "2026-07-24 10:00:00",
  };
}

async function openProspect(page: Page) {
  await page.route(`**/api/prospects/${PID}`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, json: cannedProspect() })
      : route.fulfill({ status: 200, json: cannedProspect() })
  );
  await page.route("**/api/senders", (route) =>
    route.fulfill({ status: 200, json: [{ id: 1, email: "s@example.com", display_name: "S", auth_status: "connected", daily_limit: 0, booking_url: null }] })
  );
  await page.route("**/api/settings", (route) => route.fulfill({ status: 200, json: { test_mode: "false" } }));
  await page.goto(`/prospect/${PID}`);
}

test("S-PROS-1: ステータス変更は PUT /api/prospects/{id}/status で送る", async ({ page }) => {
  let statusBody: Record<string, unknown> | null = null;
  await page.route(`**/api/prospects/${PID}/status`, (route) => {
    statusBody = route.request().postDataJSON();
    return route.fulfill({ status: 200, json: { ...cannedProspect(), send_status: "replied" } });
  });

  await openProspect(page);
  // ヘッダのステータスselect（DOM上先頭のcombobox）を別の値へ
  await page.getByRole("combobox").first().selectOption({ index: 1 });

  await expect.poll(() => statusBody).not.toBeNull();
  expect(typeof statusBody!.status).toBe("string");
});

test("S-PROS-2: 送信しないリスト追加は confirm を出し、キャンセルなら登録しない", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/suppressions", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    return route.continue();
  });

  await openProspect(page);

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "送信しないリストに追加" }).click();
  await page.waitForTimeout(400);
  expect(posts, "キャンセルなら登録しない").toBe(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "送信しないリストに追加" }).click();
  await expect.poll(() => posts).toBe(1);
});
