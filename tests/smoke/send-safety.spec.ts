import { test, expect, type Page } from "@playwright/test";

/**
 * D2/D3/D4/D10/D11/D12: 個別プロスペクト送信（/prospect/[id]）の安全レバー。
 * ここは誤送信・二重送信・違法送信に直結する最重要域。
 *
 * 外部(Gmail)には到達させない＝/api/send を intercept。
 * プロスペクト本体/送信元/設定も intercept して状態を決定的に作る（DBスキーマに非依存）。
 * 断定はネットワーク契約（送信bodyの acknowledgedWarnings 段階・toEmail・自動保存の順序）に置く。
 */

const PID = 5000;

type Over = Record<string, unknown>;

function cannedProspect(over: Over = {}) {
  return {
    id: PID,
    input_url: "https://acme.example.jp",
    domain: "acme.example.jp",
    company_name: "Acme（テスト）",
    analysis_json: JSON.stringify({
      company_name: "Acme",
      business_summary: "テスト用の事業概要",
      activities: [],
      recent_topics: [],
      compatibility: { score: "medium", reason: "テスト理由" },
      proposal_points: ["提案1"],
      hook: "フック",
    }),
    service_id: 1,
    persona_id: 1,
    subject: "テスト件名",
    body: "テスト本文です。ある程度の長さを持たせた本文。",
    generated_subject: "",
    generated_body: "",
    emails_found_json: JSON.stringify(["first@acme.example.jp", "second@acme.example.jp"]),
    form_url: "",
    is_form_only: 0,
    compatibility_score: "medium",
    has_refusal: 0,
    refusal_text: null,
    template_id: null,
    send_status: "unsent",
    scheduled_at: null,
    created_at: "2026-07-24 10:00:00",
    ...over,
  };
}

const CANNED_SENDERS = [
  {
    id: 1,
    email: "smoke-sender@example.com",
    display_name: "Smoke Sender",
    auth_status: "connected",
    daily_limit: 0,
    booking_url: null,
  },
];

/** mount時のGET(prospect/senders/settings)を作り物で固定して /prospect/PID を開く */
async function openProspect(
  page: Page,
  opts: { prospect?: Over; testMode?: boolean } = {}
) {
  const prospect = cannedProspect(opts.prospect);
  await page.route(`**/api/prospects/${PID}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: prospect });
    } else {
      // 送信直前の自動保存 PUT {subject, body}
      await route.fulfill({ status: 200, json: { ...prospect, ...route.request().postDataJSON() } });
    }
  });
  await page.route("**/api/senders", (route) =>
    route.fulfill({ status: 200, json: CANNED_SENDERS })
  );
  await page.route("**/api/settings", (route) =>
    route.fulfill({ status: 200, json: { test_mode: opts.testMode ? "true" : "false" } })
  );
  await page.goto(`/prospect/${PID}`);
}

/** 表示中（visible）の「送信」ボタン（モバイル/デスクトップの二重を吸収） */
function sendButton(page: Page) {
  return page.getByRole("button", { name: "送信", exact: true }).filter({ visible: true });
}

test("S-SEND-1/D2/D11: 警告承知は2段階（初手false→409→承認→ack true）で toEmail は先頭固定", async ({ page }) => {
  const sendBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/send", async (route) => {
    const b = route.request().postDataJSON();
    sendBodies.push(b);
    if (sendBodies.length === 1) {
      // 1段目: サーバが要確認を返す
      await route.fulfill({ status: 409, json: { warnings: ["この文面は汎用的すぎる可能性があります"] } });
    } else {
      await route.fulfill({ status: 200, json: { ok: true, testMode: false } });
    }
  });
  // 警告confirmを承認
  page.on("dialog", (d) => d.accept());

  await openProspect(page);
  await expect(sendButton(page)).toBeEnabled();
  await sendButton(page).click();

  await expect.poll(() => sendBodies.length).toBe(2);
  expect(sendBodies[0].acknowledgedWarnings, "1段目は false").toBe(false);
  expect(sendBodies[1].acknowledgedWarnings, "2段目(承認後)は true").toBe(true);
  // toEmail は emailsFound[0] 固定
  expect(sendBodies[0].toEmail).toBe("first@acme.example.jp");
  expect(sendBodies[0].prospectId).toBe(PID);
});

test("S-SEND-2/D3: 営業お断り検出時は送信前confirmを出し、拒否したら送らない", async ({ page }) => {
  let sendCalls = 0;
  await page.route("**/api/send", (route) => {
    sendCalls++;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  // お断りconfirmを「キャンセル」する
  page.on("dialog", (d) => d.dismiss());

  await openProspect(page, { prospect: { has_refusal: 1, refusal_text: "営業お断り" } });
  // お断りバナーが出ている
  await expect(page.getByText(/営業お断り|お断り/).first()).toBeVisible();
  await sendButton(page).click();

  // 少し待っても送信は発火しない
  await page.waitForTimeout(800);
  expect(sendCalls, "お断りをキャンセルしたら送信されない").toBe(0);
});

test("S-SEND-3/D4: 送信済みは送信不可（canSend は unsent のみ）", async ({ page }) => {
  await openProspect(page, { prospect: { send_status: "sent" } });
  // 送信ボタンは無効化されている（二重送信防止）
  await expect(sendButton(page)).toBeDisabled();
});

test("S-SEND-4/D10: テストモード時はバナーで宛先上書きを明示する", async ({ page }) => {
  await openProspect(page, { testMode: true });
  await expect(page.getByText("テストモード: 宛先はテストアドレスに強制上書きされます")).toBeVisible();
});

test("S-SEND-6/D12: 送信直前に自動保存(PUT)してから送信(POST)する", async ({ page }) => {
  const order: string[] = [];
  // PUT を記録するため prospect ルートを上書き（method分岐）
  await page.route(`**/api/prospects/${PID}`, async (route) => {
    const m = route.request().method();
    if (m === "GET") {
      await route.fulfill({ status: 200, json: cannedProspect() });
    } else {
      order.push("PUT");
      await route.fulfill({ status: 200, json: cannedProspect() });
    }
  });
  await page.route("**/api/senders", (route) => route.fulfill({ status: 200, json: CANNED_SENDERS }));
  await page.route("**/api/settings", (route) =>
    route.fulfill({ status: 200, json: { test_mode: "false" } })
  );
  await page.route("**/api/send", async (route) => {
    order.push("SEND");
    await route.fulfill({ status: 200, json: { ok: true, testMode: false } });
  });
  page.on("dialog", (d) => d.accept());

  await page.goto(`/prospect/${PID}`);
  await expect(sendButton(page)).toBeEnabled();
  await sendButton(page).click();

  await expect.poll(() => order.join(">")).toContain("PUT>SEND");
});
