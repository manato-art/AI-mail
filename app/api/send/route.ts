import { NextRequest, NextResponse } from "next/server";
import {
  getProspect,
  getSender,
  getService,
  getPersona,
  createSendLog,
  updateProspectStatus,
  updateSenderAuthStatus,
} from "@/lib/db";
import { runSendGuard } from "@/lib/send-guard";
import { runDangerCheck } from "@/lib/danger-check";
import { applyBookingLink } from "@/lib/booking";
import { resolveEmailVariables } from "@/lib/variables";
import { sendEmail, type EmailAttachment } from "@/lib/gmail";
import { getSetting } from "@/lib/db";
import { loadEmailAttachments } from "@/lib/attachments";
import type { AnalysisResult } from "@/lib/types";

function parseAnalysis(json: string): AnalysisResult | null {
  try {
    const parsed = JSON.parse(json) as AnalysisResult;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const TEST_MODE_RECIPIENT = process.env.TEST_MODE_RECIPIENT?.trim() ?? "";
const TEST_MODE = TEST_MODE_RECIPIENT.length > 0;

export async function POST(request: NextRequest) {
  let body: {
    prospectId: number;
    senderId: number;
    toEmail: string;
    attachmentIds?: number[];
    /** F18の警告を画面で確認済み。ブロック指摘はこのフラグでは解除されない */
    acknowledgedWarnings?: boolean;
    /** F14: 日程調整リンクを本文に添える。仕様書どおり既定はOFF（1通目には入れない） */
    includeBookingLink?: boolean;
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

  if (body.includeBookingLink && !sender.booking_url.trim()) {
    return NextResponse.json(
      { error: "日程調整URLが未設定です。設定ページで登録してください" },
      { status: 400 }
    );
  }

  const analysis = parseAnalysis(prospect.analysis_json);
  const service = getService(prospect.service_id);
  const persona = getPersona(prospect.persona_id);

  // F14: 日程調整リンクはDBを汚さず送信時のみ本文に添える
  const bodyWithBooking = body.includeBookingLink
    ? applyBookingLink(prospect.body, sender.booking_url)
    : prospect.body;

  // F4/F9: 差し込み変数を解決。値が無い変数は原文のまま残り、下の送信ガードが弾く
  const resolved = resolveEmailVariables(prospect.subject, bodyWithBooking, {
    company_name: prospect.company_name || analysis?.company_name,
    person_name: analysis?.representative_name ?? undefined,
    sender_name: persona?.name,
    service_name: service?.name,
    lp_url: service?.lp_url ?? undefined,
    booking_url: sender.booking_url,
  });
  const outgoingSubject = resolved.subject;
  const outgoingBody = resolved.body;

  const guardResult = runSendGuard({
    toEmail: TEST_MODE ? rawToEmail : toEmail,
    subject: outgoingSubject,
    body: outgoingBody,
    senderId,
    prospectId,
    skipOwnDomainCheck: !!body.acknowledgedWarnings,
  });

  if (!guardResult.canSend) {
    return NextResponse.json(
      { error: "送信ガードにより送信できません", reasons: guardResult.reasons },
      { status: 422 }
    );
  }

  // F18: 危険ワード・事実誤認の検知。ブロックは押し切れない、警告は確認の上で押し切れる
  if (analysis) {
    const danger = runDangerCheck({
      subject: outgoingSubject,
      body: outgoingBody,
      analysis,
      service,
      persona,
      // テストモードでも実際の宛先で照合する（誤差し込みはそこで起きるため）
      toEmail: rawToEmail,
    });

    if (!danger.canSend) {
      return NextResponse.json(
        { error: "事実誤認の疑いがあるため送信できません", reasons: danger.blocks },
        { status: 422 }
      );
    }

    if (danger.warnings.length > 0 && !body.acknowledgedWarnings) {
      return NextResponse.json(
        {
          error: "送信前に確認が必要な指摘があります",
          warnings: danger.warnings,
          requiresAcknowledgement: true,
        },
        { status: 409 }
      );
    }
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
      subject: outgoingSubject,
      body: outgoingBody,
      unsubscribeEmail,
      attachments,
    });

    createSendLog({
      prospect_id: prospectId,
      sender_id: senderId,
      to_email: toEmail,
      subject: outgoingSubject,
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
