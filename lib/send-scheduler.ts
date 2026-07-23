import {
  getSender,
  getSetting,
  getDueScheduledProspects,
  updateProspectStatus,
  updateSenderAuthStatus,
  claimEmailForSend,
  releaseEmailClaim,
} from "@/lib/db";
import { runSendGuard } from "@/lib/send-guard";
import { recordSuccessfulSend } from "@/lib/post-send";
import { sendEmail } from "@/lib/gmail";
import { logActivity } from "@/lib/activity-log";

/** 1ティックで送る予約の上限。相手サイトではなくGmail送信なので少しずつでよい */
const SCHEDULE_BATCH = 20;

export interface ScheduledSendResult {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * 予定時刻が到来した予約prospectを送信する。
 * 本文(subject/body)は予約時点で最終化済みなので、ここでは再構成せずそのまま送る。
 * 予約後に抑止・重複が増えている可能性があるため送信ガードは再検証する。
 * 送信の各段は実績のあるライブラリ（send-guard / gmail / post-send）を流用する。
 */
export async function runScheduledSendBatch(limit: number = SCHEDULE_BATCH): Promise<ScheduledSendResult> {
  const due = getDueScheduledProspects(limit);
  if (due.length === 0) return { processed: 0, sent: 0, failed: 0 };

  const testRecipient = process.env.TEST_MODE_RECIPIENT?.trim() ?? "";
  const testMode = testRecipient.length > 0;

  let sent = 0;
  let failed = 0;

  for (const p of due) {
    const rawToEmail = p.scheduled_to_email ?? "";
    const senderId = p.scheduled_sender_id ?? 0;
    const sender = getSender(senderId);
    if (!sender || !rawToEmail) {
      updateProspectStatus(p.id, "failed");
      logActivity(`⏰ 予約送信: ${p.company_name || rawToEmail || `#${p.id}`} は送信者/宛先が不明のため失敗`, "error");
      failed++;
      continue;
    }

    // 予約後に抑止リスト・重複送信が増えている可能性があるので再検証する
    const guard = runSendGuard({
      toEmail: rawToEmail,
      subject: p.subject,
      body: p.body,
      senderId,
      prospectId: p.id,
      force: false,
    });
    if (!guard.canSend) {
      updateProspectStatus(p.id, "failed");
      logActivity(`⏰ 予約送信ブロック: ${p.company_name || rawToEmail} — ${guard.reasons.join(" / ")}`, "warn");
      failed++;
      continue;
    }

    // 同一宛先の同時送信を1件に絞る。取れなければ次のtickで再試行（scheduledのまま残す）
    const claimId = claimEmailForSend(rawToEmail);
    if (claimId === null) continue;

    const toEmail = testMode ? testRecipient : rawToEmail;
    const unsubscribeEmail = getSetting("sender_email") ?? sender.email;
    try {
      const result = await sendEmail({
        encryptedRefreshToken: sender.google_refresh_token_encrypted,
        from: sender.email,
        fromName: sender.display_name,
        to: toEmail,
        subject: p.subject,
        body: p.body,
        unsubscribeEmail,
        attachments: [],
      });
      // 送信成功後の記録は共通処理へ（失敗しても sent を巻き戻さない・#9）
      // テストモードは実績にしない（未送信のまま・履歴/バッジに載せない）
      recordSuccessfulSend(
        {
          prospectId: p.id,
          senderId,
          toEmail,
          realToEmail: rawToEmail,
          subject: p.subject,
          messageId: result.messageId,
          threadId: result.threadId,
        },
        testMode
      );
      logActivity(
        testMode
          ? `⏰ 予約送信(テスト): ${p.company_name || rawToEmail} をテスト宛に送信（未送信のまま）`
          : `⏰ 予約送信: ${p.company_name || rawToEmail} へ送信しました`,
        "success"
      );
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message === "REAUTH_REQUIRED") updateSenderAuthStatus(senderId, "expired");
      // 送信できなかったので failed にする（scheduled のままだと無限リトライになる。人手で再送）
      updateProspectStatus(p.id, "failed");
      logActivity(`⏰ 予約送信失敗: ${p.company_name || rawToEmail} — ${message}`, "error");
      failed++;
    } finally {
      releaseEmailClaim(claimId);
    }
  }

  return { processed: due.length, sent, failed };
}
