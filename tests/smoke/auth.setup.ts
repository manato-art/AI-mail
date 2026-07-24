import { test as setup, expect } from "@playwright/test";

/**
 * 一度だけ本物のログインを通し、Cookie(セッション)を保存する。
 * 以後の chromium プロジェクトはこの storageState を使ってログイン済みで走る。
 *
 * パスワードは playwright.config.ts の SMOKE_PASSWORD と一致させること（テスト専用値）。
 */
const SMOKE_PASSWORD = "smoke-pass-123";
const AUTH_STATE = "tests/smoke/.auth/state.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  // ログイン画面が真っ白でない（過去に useSearchParams 混入で白画面事故）
  await expect(page.getByPlaceholder("パスワード")).toBeVisible();

  await page.getByPlaceholder("パスワード").fill(SMOKE_PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();

  // /login から抜けたら成功（マシン負荷時のコンパイル遅延を吸収して長めに待つ）
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });

  await page.context().storageState({ path: AUTH_STATE });
});
