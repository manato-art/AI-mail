import { test, expect } from "@playwright/test";

/**
 * C1 / C2: ナビ（IA骨格）の退行検知。
 * - リンク先ルートが契約どおりか（作り替えで別ルートに繋がると目的画面に着かない）
 * - アクティブ判定（aria-current, 最長一致）が保たれるか
 *
 * シェルのナビ（header 内の左サイドバー）に限定して検査する
 * （モバイルのドロワーは開いた時だけ描画される別要素）。
 */

// ラベル → 遷移先ルート（app-shell.tsx の NAV_ITEMS 契約。「設定」は /settings＝全般を指す）
const NAV: Array<[string, string]> = [
  ["宛先集め", "/collection"],
  ["メール作成", "/generate"],
  ["一括送信", "/bulk-send"],
  ["履歴", "/history"],
  ["設定", "/settings"],
  ["ホーム", "/"],
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

  // /settings/* では「設定」がアクティブ（最長一致で /settings を拾う）
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

  // ホームでは「ホーム」だけアクティブ（"/" が子ルートを誤って拾わない）
  await page.goto("/");
  await expect(header.getByRole("link", { name: "ホーム", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
});
