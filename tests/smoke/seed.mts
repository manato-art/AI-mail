/**
 * スモークテスト用の使い捨てDBを作り直す。
 *
 * playwright.config.ts の webServer が next dev の前に走らせる。
 * DATABASE_DIR は config から渡る一時ディレクトリ。本番 data/ には一切触らない。
 *
 * seed は最小限（サービス1・人格1・接続済み送信元1）。
 * 一覧/フィルタ/送信などのフロー系テストは各specでAPIをintercept（作り物応答）して
 * 決定的に検証するので、ここで大量のダミーデータは作らない。
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.env.DATABASE_DIR;
if (!dir) {
  console.error("DATABASE_DIR が未設定です。playwright.config.ts 経由で実行してください。");
  process.exit(1);
}

// 前回の残骸を消して毎回まっさらから
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(path.join(dir, `sales-mail.db${suffix}`), { force: true });
}

// db を import する前にディレクトリを用意（getDb でも作るが明示しておく）
fs.mkdirSync(dir, { recursive: true });

const { createService, createPersona, upsertSender } = await import("@/lib/db");

createService({
  name: "スモークサービス",
  description: "スモークテスト用の商材。実在しないダミー。",
  strengths: "速い,安い,テスト用",
  target: "中小企業",
});

createPersona({
  name: "テスト太郎",
  title: "営業担当",
  gender: "",
  age_range: "30代",
  company_name: "Cypherone（テスト）",
  signature_block: "テスト太郎\nCypherone（テスト）",
  logic: 3,
  passion: 3,
  politeness: 3,
  salesiness: 3,
  length: 3,
});

// auth_status='connected' で作られる。トークンはダミー（送信は各specでintercept）
upsertSender({
  email: "smoke-sender@example.com",
  display_name: "Smoke Sender",
  google_refresh_token_encrypted: "smoke-dummy-token",
});

console.log("[smoke seed] done:", dir);
