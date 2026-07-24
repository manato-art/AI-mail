import { test, expect } from "@playwright/test";

/**
 * C4: 企業一覧 → 生成(まとめて) のページ間受け渡し。
 * 「メール生成」を押すと /generate?mode=batch へ遷移する（選択企業IDは sessionStorage 経由）。
 * この遷移契約が壊れると、企業一覧から生成へ企業が渡らない。
 */
const COMPANY = {
  id: 8001,
  name: "受け渡しテスト社",
  domain: "handoff.example.jp",
  hp_url: "https://handoff.example.jp",
  enrichment_status: "done",
  collection_keyword: null,
  collection_service_id: null,
  collection_service_name: null,
  source: "manual",
  source_detail: null,
  created_at: "2026-07-24 10:00:00",
};

test("S-NAV-4/C4: 企業を選んで「メール生成」で /generate?mode=batch へ渡す", async ({ page }) => {
  await page.route("**/api/companies", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: { companies: [COMPANY], contacts: [] } });
    }
    return route.continue();
  });
  await page.route("**/api/companies/gen-status", (route) =>
    route.fulfill({ status: 200, json: { sentDomains: [], generatedDomains: [] } })
  );

  await page.goto("/collection/companies");
  await expect(page.getByText("受け渡しテスト社").first()).toBeVisible();

  // 全選択（hp_url を持つ企業だけが選択対象）
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "メール生成" }).click();

  await page.waitForURL("**/generate**");
  expect(page.url()).toContain("/generate");
  expect(page.url()).toContain("mode=batch");
});

test("S-LIST-3/G3: hp_url を持たない企業は選択対象から除外される", async ({ page }) => {
  const noHp = {
    ...COMPANY,
    id: 8002,
    name: "HP無し社",
    domain: "nohp.example.jp",
    hp_url: null,
    enrichment_status: "pending",
  };
  await page.route("**/api/companies", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: { companies: [COMPANY, noHp], contacts: [] } });
    }
    return route.continue();
  });
  await page.route("**/api/companies/gen-status", (route) =>
    route.fulfill({ status: 200, json: { sentDomains: [], generatedDomains: [] } })
  );

  await page.goto("/collection/companies");
  await expect(page.getByText("HP無し社").first()).toBeVisible();

  // チェックボックスは「全選択ヘッダ1つ + hp_url あり企業1行」= 2 個だけ。
  // hp_url 無しの行にはチェックボックスが出ない（＝選択・生成対象にならない）
  await expect(page.getByRole("checkbox")).toHaveCount(2);
});
