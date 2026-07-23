import { NextRequest, NextResponse } from "next/server";
import {
  getProspect,
  getSender,
  getService,
  getPersona,
  updateProspectStatus,
  claimProspectForSending,
  claimEmailForSend,
  releaseEmailClaim,
  scheduleProspect,
  updateSenderAuthStatus,
} from "@/lib/db";
import { recordSuccessfulSend } from "@/lib/post-send";
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
    /** 予約送信の予定時刻（ISO文字列）。指定時は即時送信せず予約する */
    scheduledAt?: string;
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
    force: !!body.acknowledgedWarnings,
  });

  if (!guardResult.canSend) {
    return NextResponse.json(
      { error: "送信ガードにより送信できません", reasons: guardResult.reasons },
      { status: 422 }
    );
  }

  // F18: 危険ワード・事実誤認の検知。
  // BLOCK級（宛先と本文の会社が食い違う・数値捏造等）は acknowledgedWarnings では
  // 解除しない。承認で押し切れるのは warn 級のみ。
  if (analysis) {
    const danger = runDangerCheck({
      subject: outgoingSubject,
      body: outgoingBody,
      analysis,
      service,
      persona,
      toEmail: rawToEmail,
    });

    if (!danger.canSend) {
      return NextResponse.json(
        { error: "事実誤認の疑いがあるため送信できません", reasons: danger.blocks },
        { status: 422 }
      );
    }

    if (!body.acknowledgedWarnings && danger.warnings.length > 0) {
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

  // 予約送信: 時刻指定があれば、ここまでのガードを通過した最終内容で予約状態にして
  // 即時送信しない。時刻到来時に常駐スケジューラがこの内容をそのまま送る。
  if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "予約日時の形式が不正です" }, { status: 400 });
    }
    if (when.getTime() <= Date.now() + 30_000) {
      return NextResponse.json({ error: "予約日時は現在より先の時刻を指定してください" }, { status: 400 });
    }
    // UTCの 'YYYY-MM-DD HH:MM:SS' で保存（getDueScheduledProspectsのUTC比較と揃える）
    const scheduledAtUtc = when.toISOString().slice(0, 19).replace("T", " ");
    scheduleProspect(prospectId, {
      scheduledAt: scheduledAtUtc,
      senderId,
      toEmail: rawToEmail,
      subject: outgoingSubject,
      body: outgoingBody,
    });
    return NextResponse.json({ scheduled: true, scheduledAt: scheduledAtUtc, prospectId });
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

  // #7 並行対策: 同一宛先への“同時”送信を1件に絞るアトミックなクレーム（force でも不可・
  // 90日重複とは別。単発送信の意図的な再送は殺さず、真に同時のリクエストだけを弾く）。
  // 以降のすべての return の前で releaseEmailClaim して解放する。
  const claimId = claimEmailForSend(rawToEmail);
  if (claimId === null) {
    return NextResponse.json(
      { error: "このアドレスは現在送信処理中のため、重複送信を防止しました" },
      { status: 409 }
    );
  }

  // 二重送信防止: send_status を条件付きで 'sending' にクレームする（CAS）。
  // 既に別リクエストが送信中/送信済みなら claimed=false で、送信APIを呼ばず中断する。
  if (!claimProspectForSending(prospectId)) {
    releaseEmailClaim(claimId);
    return NextResponse.json(
      { error: "このメールは既に送信処理中または送信済みです" },
      { status: 409 }
    );
  }

  const unsubscribeEmail = getSetting("sender_email") ?? sender.email;

  // --- 送信本体: ここが失敗した時だけ「まだ送っていない」ので unsent に戻して良い（#9） ---
  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail({
      encryptedRefreshToken: sender.google_refresh_token_encrypted,
      from: sender.email,
      fromName: sender.display_name,
      to: toEmail,
      subject: outgoingSubject,
      body: outgoingBody,
      unsubscribeEmail,
      attachments,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "REAUTH_REQUIRED") {
      updateSenderAuthStatus(senderId, "expired");
      updateProspectStatus(prospectId, "unsent");
      releaseEmailClaim(claimId);
      return NextResponse.json(
        { error: "Gmail認証が無効です。再認証してください。" },
        { status: 401 }
      );
    }

    updateProspectStatus(prospectId, "unsent");
    releaseEmailClaim(claimId);
    return NextResponse.json(
      { error: "メール送信に失敗しました" },
      { status: 500 }
    );
  }

  // --- 送信成功後の記録は共通処理へ。失敗しても unsent へ戻さず・失敗を返さず警告に降格 ---
  const { warnings } = recordSuccessfulSend({
    prospectId,
    senderId,
    toEmail,
    realToEmail: rawToEmail,
    subject: outgoingSubject,
    messageId: result.messageId,
    threadId: result.threadId,
  });

  // 送信＋記録が終わったのでクレームを解放
  releaseEmailClaim(claimId);

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
    testMode: TEST_MODE,
    actualRecipient: TEST_MODE ? toEmail : undefined,
    ...(warnings.length > 0 && { warnings }),
  });
}
