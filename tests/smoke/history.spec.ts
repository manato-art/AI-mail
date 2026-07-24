import { test, expect, type Page } from "@playwright/test";

/**
 * G2: 履歴の「📅 予約」ワンタップ絞り込み（＝ステータス絞り込み機構）が機能する。
 * /api/prospects を intercept して決定的な行を与え、絞り込みで行がDOMから消える/残るを断定する。
 * （行内ステータスselectと衝突するのでselect indexは使わず、堅牢な予約チップで検証する）
 */

function prospect(over: Record<string, unknown>) {
  return {
    id: 0,
    input_url: "https://h.example.jp",
    domain: "h.example.jp",
    company_name: "会社",
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
    send_status: "unsent",
    scheduled_at: null,
    created_at: "2026-07-24 10:00:00",
    ...over,
  };
}

const ROWS = [
  prospect({ id: 7001, company_name: "アルファ商事", send_status: "sent", created_at: "2026-07-24 12:00:00" }),
  prospect({ id: 7002, company_name: "ベータ工業", send_status: "unsent", created_at: "2026-07-24 11:00:00" }),
  prospect({ id: 7003, company_name: "ガンマ社", send_status: "scheduled", scheduled_at: "2026-08-01 09:00:00", created_at: "2026-07-24 10:00:00" }),
];

async function openHistory(page: Page) {
  await page.route("**/api/prospects", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, json: ROWS });
    return route.continue();
  });
  await page.goto("/history");
  // レスポンシブでモバイルカードとデスクトップ表の二重描画があるため、
  // 可視性ではなく「DOM上の有無」で判定する（フィルタで行が消える/残るのが検証対象）
  await expect(page.getByText("アルファ商事")).not.toHaveCount(0);
}

// チップ「📅 予約 N件」。行の「予約取消」ボタンとは名前(件)で区別する
const reserveChip = (page: Page) => page.getByRole("button", { name: /予約.*件/ });

test("S-LIST-2/G2: 「予約」ワンタップで予約済だけに絞れる（絞り込み機構の退行検知）", async ({ page }) => {
  await openHistory(page);

  // 初期は3社とも出ている
  await expect(page.getByText("ベータ工業")).not.toHaveCount(0);
  await expect(page.getByText("ガンマ社")).not.toHaveCount(0);

  // 予約チップON → 予約済(ガンマ)だけ残る
  await reserveChip(page).click();
  await expect(page.getByText("ガンマ社")).not.toHaveCount(0);
  await expect(page.getByText("アルファ商事")).toHaveCount(0);
  await expect(page.getByText("ベータ工業")).toHaveCount(0);

  // 予約チップOFF（もう一度） → 全社に戻る
  await reserveChip(page).click();
  await expect(page.getByText("アルファ商事")).not.toHaveCount(0);
  await expect(page.getByText("ベータ工業")).not.toHaveCount(0);
});
