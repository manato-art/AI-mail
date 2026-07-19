import { NextRequest, NextResponse } from "next/server";
import {
  getProspect,
  getSender,
  createSendLog,
  updateProspectStatus,
  updateSenderAuthStatus,
} from "@/lib/db";
import { runSendGuard } from "@/lib/send-guard";
import { sendEmail, type EmailAttachment } from "@/lib/gmail";
import { getSetting } from "@/lib/db";
import { loadEmailAttachments } from "@/lib/attachments";

const TEST_MODE_RECIPIENT = process.env.TEST_MODE_RECIPIENT?.trim() ?? "";
const TEST_MODE = TEST_MODE_RECIPIENT.length > 0;

export async function POST(request: NextRequest) {
  let body: {
    prospectId: number;
    senderId: number;
    toEmail: string;
    attachmentIds?: number[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prospectId, senderId, toEmail: rawToEmail } = body;
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (!prospectId || !senderId || !rawToEmail) {
    return NextResponse.json(
      { error: "prospectId, senderId, toEmail are required" },
      { status: 400 }
    );
  }

  const toEmail = TEST_MODE ? TEST_MODE_RECIPIENT : rawToEmail;

  if (TEST_MODE && !TEST_MODE_RECIPIENT) {
    return NextResponse.json(
      { error: "テストモードですが TEST_MODE_RECIPIENT が未設定です" },
      { status: 500 }
    );
  }

  const prospect = getProspect(prospectId);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const sender = getSender(senderId);
  if (!sender) {
    return NextResponse.json({ error: "Sender not found" }, { status: 404 });
  }

  const guardResult = runSendGuard({
    toEmail: TEST_MODE ? rawToEmail : toEmail,
    subject: prospect.subject,
    body: prospect.body,
    senderId,
    prospectId,
  });

  if (!guardResult.canSend) {
    return NextResponse.json(
      { error: "送信ガードにより送信できません", reasons: guardResult.reasons },
      { status: 422 }
    );
  }

  // Resolve attachments before flipping status: a missing file must fail the
  // request outright, not strand the prospect in "sending".
  let attachments: EmailAttachment[];
  try {
    attachments = loadEmailAttachments(attachmentIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : "添付資料の読み込みに失敗しました";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // Persist "sending" state BEFORE calling send API (二重送信防止)
  updateProspectStatus(prospectId, "sending");

  const unsubscribeEmail = getSetting("sender_email") ?? sender.email;

  try {
    const result = await sendEmail({
      encryptedRefreshToken: sender.google_refresh_token_encrypted,
      from: sender.email,
      fromName: sender.display_name,
      to: toEmail,
      subject: prospect.subject,
      body: prospect.body,
      unsubscribeEmail,
      attachments,
    });

    createSendLog({
      prospect_id: prospectId,
      sender_id: senderId,
      to_email: toEmail,
      subject: prospect.subject,
      gmail_message_id: result.messageId,
      gmail_thread_id: result.threadId,
    });

    updateProspectStatus(prospectId, "sent");

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      testMode: TEST_MODE,
      actualRecipient: TEST_MODE ? toEmail : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "REAUTH_REQUIRED") {
      updateSenderAuthStatus(senderId, "expired");
      updateProspectStatus(prospectId, "unsent");
      return NextResponse.json(
        { error: "Gmail認証が無効です。再認証してください。" },
        { status: 401 }
      );
    }

    updateProspectStatus(prospectId, "unsent");
    return NextResponse.json(
      { error: "メール送信に失敗しました" },
      { status: 500 }
    );
  }
}
