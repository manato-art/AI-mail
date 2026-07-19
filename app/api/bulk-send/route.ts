import { NextRequest, NextResponse } from "next/server";
import {
  getProspect,
  getSender,
  createProspect,
  createSendLog,
  updateProspectStatus,
  updateSenderAuthStatus,
  getSetting,
} from "@/lib/db";
import { runSendGuard } from "@/lib/send-guard";
import { sendEmail, type EmailAttachment } from "@/lib/gmail";
import { loadEmailAttachments } from "@/lib/attachments";

const TEST_MODE_RECIPIENT = process.env.TEST_MODE_RECIPIENT?.trim() ?? "";
const TEST_MODE = TEST_MODE_RECIPIENT.length > 0;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: {
    senderId: number;
    baseProspectId: number;
    company: string;
    person: string;
    email: string;
    subject: string;
    body: string;
    attachmentIds?: number[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const senderId = Number(body.senderId);
  const baseProspectId = Number(body.baseProspectId);
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const rawToEmail = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const mailBody = typeof body.body === "string" ? body.body : "";
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (!senderId || !baseProspectId || !rawToEmail) {
    return NextResponse.json(
      { error: "senderId, baseProspectId, email are required" },
      { status: 400 }
    );
  }

  if (!EMAIL_PATTERN.test(rawToEmail)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません" },
      { status: 400 }
    );
  }

  if (!subject.trim() || !mailBody.trim()) {
    return NextResponse.json(
      { error: "件名・本文が空です。テンプレートを選択してください" },
      { status: 400 }
    );
  }

  const baseProspect = getProspect(baseProspectId);
  if (!baseProspect) {
    return NextResponse.json({ error: "テンプレート元のメールが見つかりません" }, { status: 404 });
  }

  const sender = getSender(senderId);
  if (!sender) {
    return NextResponse.json({ error: "送信者アカウントが見つかりません" }, { status: 404 });
  }

  const toEmail = TEST_MODE ? TEST_MODE_RECIPIENT : rawToEmail;

  // Guard runs against the real recipient even in test mode (same as /api/send)
  const guardResult = runSendGuard({
    toEmail: rawToEmail,
    subject,
    body: mailBody,
    senderId,
  });

  if (!guardResult.canSend) {
    return NextResponse.json(
      { error: "送信ガードにより送信できません", reasons: guardResult.reasons },
      { status: 422 }
    );
  }

  // Resolve attachments before creating any DB rows: a missing file must fail
  // the request outright, not strand a prospect in "sending".
  let attachments: EmailAttachment[];
  try {
    attachments = loadEmailAttachments(attachmentIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : "添付資料の読み込みに失敗しました";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const prospect = createProspect({
    input_url: "",
    domain: rawToEmail.split("@")[1] ?? "",
    company_name: company,
    analysis_json: "{}",
    service_id: baseProspect.service_id,
    persona_id: baseProspect.persona_id,
    subject,
    body: mailBody,
    generated_subject: subject,
    generated_body: mailBody,
    emails_found_json: JSON.stringify([rawToEmail]),
    form_url: null,
    is_form_only: 0,
    compatibility_score: "medium",
    has_refusal: 0,
    refusal_text: null,
    send_status: "unsent",
  });

  // Persist "sending" state BEFORE calling send API (二重送信防止)
  updateProspectStatus(prospect.id, "sending");

  const unsubscribeEmail = getSetting("sender_email") ?? sender.email;

  try {
    const result = await sendEmail({
      encryptedRefreshToken: sender.google_refresh_token_encrypted,
      from: sender.email,
      fromName: sender.display_name,
      to: toEmail,
      subject,
      body: mailBody,
      unsubscribeEmail,
      attachments,
    });

    createSendLog({
      prospect_id: prospect.id,
      sender_id: senderId,
      to_email: toEmail,
      subject,
      gmail_message_id: result.messageId,
      gmail_thread_id: result.threadId,
    });

    updateProspectStatus(prospect.id, "sent");

    return NextResponse.json({
      success: true,
      prospectId: prospect.id,
      messageId: result.messageId,
      testMode: TEST_MODE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "REAUTH_REQUIRED") {
      updateSenderAuthStatus(senderId, "expired");
      updateProspectStatus(prospect.id, "unsent");
      return NextResponse.json(
        { error: "Gmail認証が無効です。再認証してください。" },
        { status: 401 }
      );
    }

    console.error("bulk-send failed:", { prospectId: prospect.id, toEmail, error: err });
    updateProspectStatus(prospect.id, "unsent");
    return NextResponse.json(
      { error: "メール送信に失敗しました" },
      { status: 500 }
    );
  }
}
