import { test, expect } from "@playwright/test";

/**
 * C1 / C2: ナビ（IA骨格）の退行検知。
 * - リンク先ルートが契約どおりか（作り替えで別ルートに繋がると目的画面に着かない）
 * - アクティブ判定（aria-current, 最長一致）が保たれるか
 *
 * デスクトップのヘッダナビ（header 内）に限定して検査する（モバイル下タブは別要素）。
 */

// ラベル → 遷移先ルート（nav-header.tsx の NAV_ITEMS 契約。「設定」は /settings/templates を指す）
const NAV: Array<[string, string]> = [
  ["企業リスト", "/collection"],
  ["生成", "/generate"],
  ["一括送信", "/bulk-send"],
  ["履歴", "/history"],
  ["設定", "/settings/templates"],
  ["ダッシュボード", "/"],
];

for (const [label, path] of NAV) {
  test(`S-NAV-1: ナビ「${label}」が ${path} へ遷移する`, async ({ page }) => {
    await page.goto("/");
    await page.locator("header").getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL((url) => url.pathname === path || url.pathname + "/" === path + "/");
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test("S-NAV-2: アクティブタブ判定（aria-current, 最長一致）が保たれる", async ({ page }) => {
  const header = page.locator("header");

  // /settings/* では「設定」がアクティブ（activePrefix=/settings）
  await page.goto("/settings/personas");
  await expect(header.getByRole("link", { name: "設定", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );

  // 履歴ページでは「履歴」がアクティブ、「設定」は非アクティブ
  await page.goto("/history");
  await expect(header.getByRole("link", { name: "履歴", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(header.getByRole("link", { name: "設定", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page"
  );

  // ダッシュボードでは「ダッシュボード」だけアクティブ（"/" が子ルートを誤って拾わない）
  await page.goto("/");
  await expect(header.getByRole("link", { name: "ダッシュボード", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
});
