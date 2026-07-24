import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * UIスモークテスト設定（IA/UI/UX大改修の安全網）。
 *
 * 安全担保:
 * - DATABASE_DIR を使い捨ての一時DBに固定 → 本番 data/ に触らない
 * - COLLECTION_SCHEDULE_DISABLED=1 → 収集スケジューラを止めて起動
 * - APP_PASSWORD を設定 → proxy.ts の本物の認証を通す（setupで一度ログイン）
 * - 外部APIキーはダミー固定 → intercept漏れがあっても本物のGmail/Claude/Serperに到達しない
 *   （.env.local の実キーは @next/env が既存 process.env を上書きしないので無効化される）
 *
 * 起動: seed(一時DBを作り直す) → next dev。ポート3599固定。
 */

const SMOKE_PORT = 3599;
const SMOKE_HOST = "127.0.0.1";
const BASE_URL = `http://${SMOKE_HOST}:${SMOKE_PORT}`;

// setup と共有するテスト用パスワード（本番のものではない）
export const SMOKE_PASSWORD = "smoke-pass-123";

const TEST_DB_DIR = path.join(process.cwd(), "tests", "smoke", ".tmp-db");

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1, // 単一サーバ/単一DBを共有するため直列で確実に
  forbidOnly: !!process.env.CI,
  // next dev の遅延コンパイルやマシン負荷による一過性タイムアウトを吸収する
  retries: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/smoke/.auth/state.json",
      },
    },
  ],

  webServer: {
    command: `npx tsx tests/smoke/seed.mts && npx next dev -p ${SMOKE_PORT} -H ${SMOKE_HOST}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_DIR: TEST_DB_DIR,
      APP_PASSWORD: SMOKE_PASSWORD,
      COLLECTION_SCHEDULE_DISABLED: "1",
      // intercept漏れ時の二重安全: 本物の外部サービスに到達させない
      ANTHROPIC_API_KEY: "smoke-dummy-anthropic",
      GEMINI_API_KEY: "smoke-dummy-gemini",
      GOOGLE_API_KEY: "smoke-dummy-google",
      SERPER_API_KEY: "smoke-dummy-serper",
    },
  },
});
