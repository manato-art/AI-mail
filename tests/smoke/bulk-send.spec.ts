import { test, expect, type Page } from "@playwright/test";

/**
 * D5/D6/D7/D8/D13/D14: 一括送信の「生成済みメールを各社へ送信」タブ（最重要域）。
 *
 * 検証の重心はネットワーク契約: 「地雷入りの生成メール群」を送ったとき、
 * 実際に /api/send へ飛ぶのは "安全な部分集合だけ" であることを送信bodyで断定する。
 * - 送信済み(sent)/予約済み(scheduled)は送らない（D5）
 * - 同じ会社へは1件だけ（D6。宛先アドレス単位ではなく会社単位＝サーバ側の重複ガードと同じ判定）
 * - 同じ会社の中では最新の1件だけ（D7）
 * - acknowledgedWarnings は既定 false で伝播（D8）
 * - 過去日時の予約は弾く（D13）／送信前に確認ダイアログ（D14）
 *
 * 外部(Gmail)には到達させない＝/api/send と /api/prospects/bulk-schedule を intercept。
 */

/** 生成済みメールの面（M6でモーダル→モード2タブのパネルへ昇格。中身の契約は不変） */
const MODAL = '[aria-labelledby="bulk-generated-title"]';

function genProspect(over: Record<string, unknown>) {
  return {
    id: 0,
    input_url: "https://x.example.jp",
    domain: "x.example.jp",
    company_name: "C社",
    analysis_json: "{}",
    service_id: 1,
    persona_id: 1,
    subject: "件名",
    body: "本文",
    generated_subject: "生成件名", // これら3つが揃うと「生成済み」として扱われる
    generated_body: "生成本文",
    emails_found_json: JSON.stringify(["mail@x.com"]),
    form_url: "",
    is_form_only: 0,
    compatibility_score: "medium",
    has_refusal: 0,
    refusal_text: null,
    template_id: null,
    send_status: "unsent",
    scheduled_at: null,
    created_at: "2026-07-24 12:00:00",
    ...over,
  };
}

// 地雷入りの生成メール群（送ってよいのは 6001,6002 の2件だけ）
// 会社単位の重複ガードが入ったので、別々に扱ってほしい行は別会社（別ドメイン）にする
const PROSPECTS = [
  genProspect({ id: 6001, company_name: "A社", domain: "a-corp.jp", emails_found_json: JSON.stringify(["keep-a@a-corp.jp"]), created_at: "2026-07-24 12:00:00" }), // ✅ A社(最新)
  genProspect({ id: 6002, company_name: "B社", domain: "b-corp.jp", emails_found_json: JSON.stringify(["b@b-corp.jp"]), created_at: "2026-07-24 11:30:00" }), // ✅ B社
  genProspect({ id: 6004, company_name: "C社", domain: "c-corp.jp", emails_found_json: JSON.stringify(["c@c-corp.jp"]), send_status: "sent", created_at: "2026-07-24 11:00:00" }), // ❌ 送信済み
  genProspect({ id: 6005, company_name: "D社", domain: "d-corp.jp", emails_found_json: JSON.stringify(["d@d-corp.jp"]), send_status: "scheduled", created_at: "2026-07-24 10:30:00" }), // ❌ 予約済み
  genProspect({ id: 6006, company_name: "E社", domain: "e-corp.jp", emails_found_json: JSON.stringify([]), created_at: "2026-07-24 10:00:00" }), // ❌ メアド無し
  genProspect({ id: 6003, company_name: "A社", domain: "a-corp.jp", emails_found_json: JSON.stringify(["keep-a@a-corp.jp"]), created_at: "2026-07-24 09:00:00" }), // ❌ A社の古い重複
];

async function openGeneratedModal(page: Page, prospects: unknown[] = PROSPECTS) {
  await page.route("**/api/prospects", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, json: prospects });
    return route.continue();
  });
  await page.goto("/bulk-send");
  // IA-DESIGN §6-6: 開き方だけタブ切替に変更（ネットワーク契約・内部セレクタは不変）
  await page.getByRole("button", { name: /生成済みメールを送る/ }).filter({ visible: true }).first().click();
  await expect(page.locator(MODAL)).toBeVisible();
}

test("S-BULK-1/D5-D8/D14: 送るのは安全な部分集合だけ（送信済/予約済/重複/最新以外/メアド無しを除外）", async ({ page }) => {
  const sent: Array<{ prospectId: number; toEmail: string; ack: unknown }> = [];
  let scheduleCalled = 0;
  const dialogs: string[] = [];

  await page.route("**/api/send", async (route) => {
    const b = route.request().postDataJSON();
    sent.push({ prospectId: b.prospectId, toEmail: b.toEmail, ack: b.acknowledgedWarnings });
    await route.fulfill({ status: 200, json: { ok: true, testMode: false } });
  });
  await page.route("**/api/prospects/bulk-schedule", (route) => {
    scheduleCalled++;
    return route.fulfill({ status: 200, json: { scheduled: 0, failed: [] } });
  });
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });

  await openGeneratedModal(page);
  // 既定で「送信可能=各宛先の最新1件・未送信」だけがチェック済み。そのまま送信する。
  await page.locator(MODAL).getByRole("button", { name: "選択を各社へ送信" }).click();

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(2);
  const ids = sent.map((s) => s.prospectId);
  const emails = sent.map((s) => s.toEmail).sort();
  // D6/D7: 会社は重複なく、A社 は最新1件だけ（並び順に依存せず email 集合で断定）
  expect(emails).toEqual(["b@b-corp.jp", "keep-a@a-corp.jp"]);
  // D5: 送信済(6004)・予約済(6005)・メアド無し(6006)は絶対に送らない
  expect(ids).not.toContain(6004);
  expect(ids).not.toContain(6005);
  expect(ids).not.toContain(6006);
  // A社 の重複は 6001/6003 のどちらか「片方だけ」
  expect(ids.filter((id) => id === 6001 || id === 6003).length, "A社の重複は1件だけ送る").toBe(1);
  // D8: acknowledgedWarnings は既定 false で必ず伝播
  expect(sent.every((s) => s.ack === false), "ack は既定 false").toBe(true);
  // D14: 送信前に確認ダイアログが出た
  expect(dialogs.length, "確認ダイアログが出る").toBeGreaterThanOrEqual(1);
  // 即時送信なので予約APIは呼ばれない
  expect(scheduleCalled).toBe(0);
});

// 同じ会社（別アドレス）の生成メールが何件もあり、その会社には既に送信済みのケース。
// 「まだ送っていない」で絞ったときに、この会社の行が重複して並んではいけない。
const SAME_COMPANY = [
  genProspect({ id: 7001, company_name: "株式会社マネフォ", domain: "mf-test.co.jp", emails_found_json: JSON.stringify(["pr@mf-test.co.jp"]), created_at: "2026-07-27 09:00:00" }),
  genProspect({ id: 7002, company_name: "株式会社マネフォ", domain: "mf-test.co.jp", emails_found_json: JSON.stringify(["info@mf-test.co.jp"]), created_at: "2026-07-21 09:43:00" }),
  genProspect({ id: 7003, company_name: "株式会社マネフォ", domain: "mf-test.co.jp", emails_found_json: JSON.stringify(["pr@mf-test.co.jp"]), send_status: "sent", created_at: "2026-07-22 12:49:00" }),
  genProspect({ id: 7004, company_name: "ヨソ社", domain: "yoso-test.co.jp", emails_found_json: JSON.stringify(["a@yoso-test.co.jp"]), created_at: "2026-07-26 09:00:00" }),
];

test("S-BULK-4: 「まだ送っていない」に同じ会社を重ねて出さない（送信済みの会社ごと隠す）", async ({ page }) => {
  let sendCalls = 0;
  await page.route("**/api/send", (route) => {
    sendCalls++;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  page.on("dialog", (d) => d.accept());

  await openGeneratedModal(page, SAME_COMPANY);
  const modal = page.locator(MODAL);
  await modal.getByLabel("送信状況で絞り込む").selectOption("unsent");

  // マネフォは会社として送信済み → 未送信の2件(7001/7002)ごと隠れ、残るのはヨソ社の1件だけ
  await expect(modal.getByText("株式会社マネフォ")).toHaveCount(0);
  await expect(modal.getByText("ヨソ社")).toHaveCount(1);
  // 黙って減らさず、隠した件数を出す
  await expect(modal.getByText(/2件.*は隠しています/)).toBeVisible();
  // 送信対象も1社だけ
  await expect(modal.getByText("すべて選択（送信可能 1件）")).toBeVisible();

  // 「すべて」に戻すと理由付きで見える（情報は消していない）
  await modal.getByLabel("送信状況で絞り込む").selectOption("");
  await expect(modal.getByText("🏢 この会社は送信済み")).toHaveCount(2);

  await modal.getByRole("button", { name: "選択を各社へ送信" }).click();
  await expect.poll(() => sendCalls, { timeout: 15_000 }).toBe(1);
});

test("S-BULK-3/D13: 過去日時の予約は弾く（送信も予約もしない）", async ({ page }) => {
  let sendCalls = 0;
  let scheduleCalls = 0;
  await page.route("**/api/send", (route) => {
    sendCalls++;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.route("**/api/prospects/bulk-schedule", (route) => {
    scheduleCalls++;
    return route.fulfill({ status: 200, json: { scheduled: 0, failed: [] } });
  });

  await openGeneratedModal(page);
  await page.locator(MODAL).locator('input[type="datetime-local"]').fill("2020-01-01T00:00");
  await page.locator(MODAL).getByRole("button", { name: "予約送信" }).click();

  await expect(page.getByText("予約日時は現在より先の時刻を指定してください")).toBeVisible();
  await page.waitForTimeout(500);
  expect(sendCalls, "過去予約は送信しない").toBe(0);
  expect(scheduleCalls, "過去予約は予約APIも叩かない").toBe(0);
});
