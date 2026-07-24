import { test, expect } from "@playwright/test";

/**
 * A: 認証・アクセス保護（proxy.ts）の退行を検知。
 * これらは未ログイン状態で確認するので storageState を空にする。
 */
test.describe("auth (unauthenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("S-AUTH-1: 未ログインで保護ページはログインへ飛ばされる", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
    // 戻り先(next)が付与される
    expect(page.url()).toContain("next=");
  });

  test("S-AUTH-2: 未ログインAPIはHTMLでなく401を返す", async ({ page }) => {
    const res = await page.request.get("/api/prospects");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("S-AUTH-3: ログイン画面が真っ白にならず描画される", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/login");
    await expect(page.getByPlaceholder("パスワード")).toBeVisible();
    await expect(page.getByRole("button", { name: /ログイン|確認中/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("S-AUTH-4: オープンリダイレクトを防ぐ（next=外部URLは無視して同一サイトへ）", async ({ page }) => {
    await page.goto("/login?next=https://evil.example.com/steal");
    await page.getByPlaceholder("パスワード").fill("smoke-pass-123");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    // 外部サイトに飛んでいない
    expect(page.url()).toContain("127.0.0.1:3599");
    expect(page.url()).not.toContain("evil.example.com");
  });
});

test.describe("auth (authenticated)", () => {
  test("S-AUTH-5: ログイン済みなら保護ページに入れる", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/login/);
    const res = await page.request.get("/api/prospects");
    expect(res.status()).toBe(200);
  });
});
