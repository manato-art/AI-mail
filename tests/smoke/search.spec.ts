import { test, expect, type Page } from "@playwright/test";

/**
 * G5/G6/C3: キーワード検索の結果表示と受け渡し。
 * 外部(Serper/DuckDuckGo/HP解析)には到達させない＝keyword-search系を全部 intercept。
 * - メール有/フォームのみ/メール未検出 の3分岐を正しく表示（G6）
 * - 送信済み企業は送信済み表示＋「送信済みを除外」で消える（G5）
 * - 選択→一括送信リストへ受け渡し（sessionStorage 'bulk-send-import' → /bulk-send）（C3）
 */

// 送信済み判定の元（send_status!==unsent の企業からドメイン/名前を集める）
const SENT_PROSPECTS = [
  {
    id: 1,
    input_url: "https://mailco.example.jp",
    domain: "mailco.example.jp",
    company_name: "メールあり社",
    analysis_json: "{}",
    service_id: 1,
    persona_id: 1,
    subject: "",
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
    send_status: "sent",
    scheduled_at: null,
    created_at: "2026-07-24 10:00:00",
  },
];

const RESOLVE: Record<string, Record<string, unknown>> = {
  "メールあり社": { found: true, homepage: "https://mailco.example.jp", domain: "mailco.example.jp", email: "info@mailco.example.jp", formUrl: null, personName: "山田", recruitPageUrl: null },
  "フォームのみ社": { found: true, homepage: "https://formco.example.jp", domain: "formco.example.jp", email: null, formUrl: "https://formco.example.jp/contact", personName: null, recruitPageUrl: null },
  "メール無し社": { found: true, homepage: "https://noco.example.jp", domain: "noco.example.jp", email: null, formUrl: null, personName: null, recruitPageUrl: null },
};

async function runSearch(page: Page) {
  await page.route("**/api/prospects", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, json: SENT_PROSPECTS });
    return route.continue();
  });
  await page.route("**/api/settings", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: { search_mode: "scrape", serper_api_key_configured: "false" } });
    }
    return route.continue();
  });
  await page.route("**/api/keyword-search/companies", (route) =>
    route.fulfill({
      status: 200,
      json: {
        fallbackContact: "ご担当者様",
        companies: [
          { name: "メールあり社", sourceUrl: "https://src/1" },
          { name: "フォームのみ社", sourceUrl: "https://src/2" },
          { name: "メール無し社", sourceUrl: "https://src/3" },
        ],
      },
    })
  );
  await page.route("**/api/keyword-search/resolve", (route) => {
    const name = route.request().postDataJSON()?.companyName as string;
    return route.fulfill({ status: 200, json: RESOLVE[name] ?? { found: false } });
  });

  await page.goto("/collection/search");
  // AIおまかせを外して検索先を手入力（/site 経路を使わない）
  const ai = page.getByRole("checkbox").first();
  if (await ai.isChecked()) await ai.uncheck();
  await page.getByPlaceholder(/例: インターン/).fill("インターン");
  await page.getByPlaceholder(/例: wantedly/).fill("wantedly.com");
  await page.getByRole("button", { name: "検索開始" }).click();

  // 3社が解決されるまで待つ
  await expect(page.getByText("フォームのみ社")).not.toHaveCount(0);
}

test("S-LIST-6/G6: メール有/フォームのみ/メール未検出 の3分岐を正しく表示", async ({ page }) => {
  await runSearch(page);
  await expect(page.getByText("info@mailco.example.jp")).not.toHaveCount(0);
  await expect(page.getByText(/フォームのみ（メール送信不可）/)).not.toHaveCount(0);
  await expect(page.getByText("メール未検出")).not.toHaveCount(0);
});

test("S-LIST-5/G5: 送信済み企業は送信済み表示、『送信済みを除外』で消える", async ({ page }) => {
  await runSearch(page);
  // メールあり社は送信済み（domain一致）
  await expect(page.getByText("送信済み")).not.toHaveCount(0);
  await expect(page.getByText("メールあり社")).not.toHaveCount(0);

  // 「送信済みを除外」をON → メールあり社が消える
  await page.getByText("送信済みを除外").click();
  await expect(page.getByText("メールあり社")).toHaveCount(0);
  // 未送信の会社は残る
  await expect(page.getByText("メール無し社")).not.toHaveCount(0);
});

test("S-NAV-3/C3: 選択して『一括送信リストに追加』で /bulk-send へ受け渡す", async ({ page }) => {
  await runSearch(page);
  await page.getByRole("button", { name: "全選択" }).click();
  await page.getByRole("button", { name: /一括送信リストに追加/ }).click();

  await page.waitForURL("**/bulk-send");
  // 受け渡した企業が一括送信の宛先（会社名はinput value）に載っている
  const companyInputs = page.getByPlaceholder("株式会社○○");
  await expect(companyInputs).toHaveCount(3);
  const values = await companyInputs.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toContain("フォームのみ社");
});
