import { test, expect } from "@playwright/test";

/**
 * 一括生成のブレーカー: 残高切れ等「待っても直らない」失敗が続いたら残りを打ち切る。
 *
 * 2026-07-29 の本番障害では、AI APIの残高切れで60社すべてが失敗した。1社ごとに
 * サイト読み取りとGemini分析（有料）を先に走らせてから落ちるため、気付かず流し続けると
 * 全社ぶんの調査費を捨てる。ここでは「10社選んでも数社で止まる」ことを
 * /api/generate の**呼び出し回数**で断定する（メッセージ文言ではなく回数が契約）。
 */

// 画面は「hp_url があり enrichment_status=done」の企業だけを候補にする
const COMPANIES = Array.from({ length: 10 }, (_, i) => ({
  id: 8100 + i,
  name: `ブレーカー社${i + 1}`,
  domain: `breaker-${i + 1}.example.jp`,
  hp_url: `https://breaker-${i + 1}.example.jp`,
  enrichment_status: "done",
  listing_url: null,
  collection_source_id: null,
  collection_keyword: null,
  collection_service_id: null,
  collection_service_name: null,
  created_at: "2026-07-28 10:00:00",
}));

const FATAL_BODY = {
  error: "AI APIの残高・請求設定に問題があります: Your credit balance is too low to access the Anthropic API.",
  retryable: false,
  fatal: true,
};

test("S-GEN-BRK-1: 設定・請求起因の失敗が続いたら一括生成を打ち切る（無駄な調査費を出さない）", async ({ page }) => {
  let generateCalls = 0;

  await page.route("**/api/companies", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, json: { companies: COMPANIES, contacts: [] } })
      : route.continue()
  );
  await page.route("**/api/generate", (route) => {
    generateCalls++;
    return route.fulfill({ status: 500, json: FATAL_BODY });
  });

  await page.goto("/generate");
  // 人格の option は「名前（役職）」表記なので index で選ぶ（表記変更に引きずられない）
  await page.locator("#gen-service").selectOption({ index: 1 });
  await page.locator("#gen-persona").selectOption({ index: 1 });

  await page.getByText(/すべて選択（10社）/).click();
  await page.getByRole("button", { name: /10社 まとめて生成/ }).click();

  // 打ち切り理由が画面に出る（黙って止めない）
  await expect(page.getByText("同じ理由で続けて失敗したため、残りを中止しました")).toBeVisible({ timeout: 20_000 });
  // 各行のエラー文にも同じ理由が出るので first() で断定する
  await expect(page.getByText(/残高・請求設定/).first()).toBeVisible();

  // 10社ぶん流さず、数社で止まる（並列3・上限3社連続 ＋ 進行中ぶんの取りこぼしを見て 6 まで許容）
  await page.waitForTimeout(1500);
  expect(generateCalls, `10社ぶん呼んではいけない (実際: ${generateCalls})`).toBeLessThanOrEqual(6);
  expect(generateCalls, "少なくとも打ち切り判定に必要な回数は呼ぶ").toBeGreaterThanOrEqual(3);
});

test("S-GEN-BRK-2: 一時的な失敗（再試行可）では打ち切らず最後まで試す", async ({ page }) => {
  let generateCalls = 0;

  await page.route("**/api/companies", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, json: { companies: COMPANIES.slice(0, 4), contacts: [] } })
      : route.continue()
  );
  await page.route("**/api/generate", (route) => {
    generateCalls++;
    // 429（制限）は待てば直る種類。fatal を立てない
    return route.fulfill({
      status: 429,
      json: { error: "AI APIの利用制限に達しました。しばらく待ってから再試行してください", retryable: true, fatal: false },
    });
  });

  await page.goto("/generate");
  await page.locator("#gen-service").selectOption({ index: 1 });
  await page.locator("#gen-persona").selectOption({ index: 1 });
  await page.getByText(/すべて選択（4社）/).click();
  await page.getByRole("button", { name: /4社 まとめて生成/ }).click();

  // 4社すべてに到達する（1社あたり retryable で2回呼ぶ設計なので 4 以上）
  await expect.poll(() => generateCalls, { timeout: 40_000 }).toBeGreaterThanOrEqual(4);
  await expect(page.getByText("同じ理由で続けて失敗したため、残りを中止しました")).toHaveCount(0);
});
