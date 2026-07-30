import { test, expect, type Page } from "@playwright/test";

/**
 * 送信の記録（いつ送ったか・エビデンス）。
 *
 * 検証の重心:
 *  - DBの素の日時文字列は **UTC** として読み、日本時間で出す（12:49Z → 21:49）
 *  - Gmail照合は POST /api/prospects/{id}/send-log/verify を叩き、Gmail側の時刻を出す
 *  - 記録が無いのに「送信済」ラベルだけの場合、時刻を捏造しない
 */
const PID = 5200;

function cannedProspect(over: Record<string, unknown> = {}) {
  return {
    id: PID,
    input_url: "https://rec.example.jp",
    domain: "rec.example.jp",
    company_name: "記録社（テスト）",
    analysis_json: JSON.stringify({
      company_name: "記録社", business_summary: "x", activities: [], recent_topics: [],
      compatibility: { score: "medium", reason: "r" }, proposal_points: [], hook: "h",
    }),
    service_id: 1,
    persona_id: 1,
    subject: "【ご提案】記録社さま",
    body: "本文本文本文",
    generated_subject: "",
    generated_body: "",
    emails_found_json: JSON.stringify(["info@rec.example.jp"]),
    form_url: "",
    is_form_only: 0,
    compatibility_score: "medium",
    has_refusal: 0,
    refusal_text: null,
    template_id: null,
    send_status: "sent",
    scheduled_at: null,
    created_at: "2026-07-24 10:00:00",
    ...over,
  };
}

const LOG = {
  id: 9001,
  prospect_id: PID,
  sender_id: 1,
  to_email: "info@rec.example.jp",
  subject: "【ご提案】記録社さま",
  gmail_message_id: "18f0abc123",
  gmail_thread_id: "18f0thread99",
  sent_at: "2026-07-22 12:49:05", // UTC。日本時間では 21:49:05
  sender_email: "sender@cypherone.co.jp",
};

async function openProspect(page: Page, sendLogJson: unknown, prospectOver: Record<string, unknown> = {}) {
  await page.route(`**/api/prospects/${PID}`, (route) =>
    route.fulfill({ status: 200, json: cannedProspect(prospectOver) })
  );
  await page.route("**/api/senders", (route) =>
    route.fulfill({ status: 200, json: [{ id: 1, email: "s@example.com", display_name: "S", auth_status: "connected", daily_limit: 0, booking_url: null }] })
  );
  await page.route("**/api/settings", (route) => route.fulfill({ status: 200, json: { test_mode: "false" } }));
  await page.route(`**/api/prospects/${PID}/send-log`, (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, json: sendLogJson }) : route.continue()
  );
  await page.goto(`/prospect/${PID}`);
}

test("S-REC-1: 送信時刻を日本時間で出し、Gmailの控え（ID・実物リンク）を示す", async ({ page }) => {
  await openProspect(page, { scheduledAt: null, sendStatus: "sent", logs: [LOG] });

  const card = page.getByRole("region", { name: "送信の記録" });
  await expect(card).toBeVisible();
  // 12:49:05 UTC → 21:49:05 JST（ここを取り違えると9時間ずれる）
  await expect(card.getByText(/2026\/07\/22 21:49:05/)).toBeVisible();
  await expect(card.getByText("info@rec.example.jp")).toBeVisible();
  await expect(card.getByText("sender@cypherone.co.jp")).toBeVisible();
  await expect(card.getByText("18f0abc123")).toBeVisible();

  // Gmail の実物へのリンク（スレッドIDを使う）
  const link = card.getByRole("link", { name: /Gmailで実物を開く/ });
  await expect(link).toHaveAttribute("href", /mail\.google\.com.*18f0thread99/);
});

test("S-REC-2: Gmail照合でGmail側の受理時刻と一致状況を出す", async ({ page }) => {
  let verifyCalls = 0;
  await page.route(`**/api/prospects/${PID}/send-log/verify`, (route) => {
    verifyCalls++;
    return route.fulfill({
      status: 200,
      json: {
        results: [{
          logId: LOG.id,
          status: "verified",
          gmailSentAtMs: Date.UTC(2026, 6, 22, 12, 49, 7),
          gmailTo: "info@rec.example.jp",
          gmailSubject: "【ご提案】記録社さま",
          inSentBox: true,
          threadId: LOG.gmail_thread_id,
          toMatches: true,
          subjectMatches: true,
        }],
        serverTimezoneOffsetMinutes: 0,
      },
    });
  });

  await openProspect(page, { scheduledAt: null, sendStatus: "sent", logs: [LOG] });
  const card = page.getByRole("region", { name: "送信の記録" });
  await card.getByRole("button", { name: "Gmailの記録と照合する" }).click();

  await expect(card.getByText("Gmailの記録と照合できました")).toBeVisible();
  await expect(card.getByText(/2026\/07\/22 21:49:07/)).toBeVisible();
  await expect(card.getByText(/送信済みトレイに存在：あり/)).toBeVisible();
  expect(verifyCalls).toBe(1);
});

test("S-REC-3: 予約は予定時刻と実際の送信時刻の両方を出す（ズレも出す）", async ({ page }) => {
  await openProspect(
    page,
    {
      scheduledAt: "2026-07-22 12:45:00", // 予定 21:45 JST
      sendStatus: "sent",
      logs: [{ ...LOG, sent_at: "2026-07-22 12:49:05" }], // 実際 21:49:05 JST
    },
    { send_status: "sent", scheduled_at: "2026-07-22 12:45:00" }
  );

  const card = page.getByRole("region", { name: "送信の記録" });
  await expect(card.getByText(/送信予約/)).toBeVisible();
  await expect(card.getByText(/07\/22 21:45/)).toBeVisible();
  await expect(card.getByText(/2026\/07\/22 21:49:05/)).toBeVisible();
  await expect(card.getByText(/予約時刻との差：4分遅れ/)).toBeVisible();
});

test("S-REC-4: 記録が無ければ時刻を作らない（「送信済」ラベルだけでは根拠にしない）", async ({ page }) => {
  await openProspect(page, { scheduledAt: null, sendStatus: "sent", logs: [] });

  // 記録も予約も無いのでカード自体を出さない（空の枠・偽の時刻を見せない）
  await expect(page.getByRole("region", { name: "送信の記録" })).toHaveCount(0);
});
