import { test, expect, type Page } from "@playwright/test";

/**
 * B1/B2: 全ルートが「白画面にならず・未捕捉例外を出さず」描画されることを確認する。
 *
 * 大改修で最も怖い「作り替えた画面が真っ白/クラッシュ」を、全ルート横断で機械検知する。
 * DOM構造に依存しない（未捕捉例外0・致命的consoleエラー0・可視テキストあり）ので、
 * UIをどう作り替えてもこのテストは有効なまま。
 *
 * 空のテストDBで走る＝各ページは空状態を描画する（それも正当なレンダリング）。
 * mount時に叩くのは読み取り系APIのみで外部サービスには到達しない。
 */

// 認証済みで直接開けるルート（[id]付きの prospect は send-safety spec 側で intercept して検証）
const ROUTES = [
  "/",
  "/generate",
  "/bulk-send",
  "/history",
  "/collection",
  "/collection/search",
  "/collection/companies",
  "/settings",
  "/settings/personas",
  "/settings/services",
  "/settings/templates",
  "/settings/suppressions",
];

/** 未捕捉例外＝白画面のサイン。致命的なconsoleエラーも拾う（良性の警告は無視）。 */
const FATAL_CONSOLE = /hydrat|Minified React error|is not defined|Cannot read|is not a function|Maximum update depth/i;

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  return { pageErrors, consoleErrors };
}

for (const route of ROUTES) {
  test(`S-RENDER route renders without crash: ${route}`, async ({ page }) => {
    const { pageErrors, consoleErrors } = collectErrors(page);

    const resp = await page.goto(route, { waitUntil: "domcontentloaded" });

    // ログインへリダイレクトされていない（認証済み）＝保護は効きつつ入れている
    expect(page.url()).not.toContain("/login");
    // サーバがエラーページを返していない
    expect(resp?.status() ?? 0, `HTTP status for ${route}`).toBeLessThan(400);

    // 描画が進むのを少し待ってから判定（クライアント副作用の例外も拾う）
    await page.waitForTimeout(600);

    // 可視テキストがある＝真っ白ではない
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length, `visible text on ${route}`).toBeGreaterThan(0);

    // 未捕捉例外ゼロ（白画面の直接原因）
    expect(pageErrors, `uncaught errors on ${route}`).toEqual([]);

    // 致命的なconsoleエラーゼロ（hydration崩れ等）
    const fatal = consoleErrors.filter((t) => FATAL_CONSOLE.test(t));
    expect(fatal, `fatal console errors on ${route}`).toEqual([]);
  });
}
