import { NextRequest, NextResponse } from "next/server";
import {
  getSender,
  getService,
  getPersona,
  getAllServices,
  getAllPersonas,
  getTemplate,
  getContactByEmail,
  getCompanyById,
  createProspect,
  createSendLog,
  updateProspectStatus,
  updateSenderAuthStatus,
  getSetting,
} from "@/lib/db";
import { runSendGuard } from "@/lib/send-guard";
import { runDangerCheck } from "@/lib/danger-check";
import { sendEmail, type EmailAttachment } from "@/lib/gmail";
import { loadEmailAttachments } from "@/lib/attachments";
import { resolveEmailVariables } from "@/lib/variables";
import { composeBody, hasAiZones, verifyFixedPartIntact } from "@/lib/compose";
import type { AnalysisResult, Persona, Service } from "@/lib/types";

const TEST_MODE_RECIPIENT = process.env.TEST_MODE_RECIPIENT?.trim() ?? "";
const TEST_MODE = TEST_MODE_RECIPIENT.length > 0;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 設定の既定値 → 無ければ先頭 の順に解決する */
function resolveService(): Service | undefined {
  const configured = Number(getSetting("default_service_id"));
  return (Number.isInteger(configured) && configured > 0 ? getService(configured) : undefined)
    ?? getAllServices()[0];
}

function resolvePersona(): Persona | undefined {
  const configured = Number(getSetting("default_persona_id"));
  return (Number.isInteger(configured) && configured > 0 ? getPersona(configured) : undefined)
    ?? getAllPersonas()[0];
}

export async function POST(request: NextRequest) {
  let body: {
    senderId: number;
    /** F4: hybrid のとき固定文と指示を引くために使う */
    templateId?: number;
    company: string;
    person: string;
    email: string;
    /** テンプレートから展開済みの件名・本文（差し込み変数は未解決のまま渡ってくる） */
    subject: string;
    body: string;
    attachmentIds?: number[];
    /** F18の警告を画面で確認済み。ブロック指摘はこのフラグでは解除されない */
    acknowledgedWarnings?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const senderId = Number(body.senderId);
  const templateId = Number(body.templateId) || 0;
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const rawToEmail = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const mailBody = typeof body.body === "string" ? body.body : "";
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (!senderId || !rawToEmail) {
    return NextResponse.json({ error: "senderId, email are required" }, { status: 400 });
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

  const sender = getSender(senderId);
  if (!sender) {
    return NextResponse.json({ error: "送信者アカウントが見つかりません" }, { status: 404 });
  }

  const service = resolveService();
  const persona = resolvePersona();
  if (!service || !persona) {
    return NextResponse.json(
      { error: "商材または人格が登録されていません。設定ページで登録してください" },
      { status: 400 }
    );
  }

  const toEmail = TEST_MODE ? TEST_MODE_RECIPIENT : rawToEmail;

  // 一括送信はテンプレート（汎用文面）専用なので、相手企業の分析結果は存在しない。
  // 社名照合と「相手について書いた数値」の検知のために、宛先の企業名だけを持たせる。
  const analysisForCheck: AnalysisResult = {
    company_name: company,
    business_summary: "",
    activities: [],
    recent_topics: [],
    compatibility: { score: "medium", reason: "" },
    proposal_points: [],
    hook: "",
  };

  // F9: 個社LPは宛先ごとに違う。登録済み連絡先のLPを優先し、無ければ商材共通のLPを使う
  const registeredContact = getContactByEmail(rawToEmail);
  const recipientLpUrl = registeredContact?.lp_url || service?.lp_url || undefined;

  const variables = {
    company_name: company,
    person_name: typeof body.person === "string" ? body.person.trim() : undefined,
    sender_name: persona?.name,
    service_name: service?.name,
    lp_url: recipientLpUrl,
    booking_url: sender.booking_url,
  };

  // F4: hybrid のときは fixed_part を一字一句そのまま置き、続きだけAIに書かせる
  const template = templateId ? getTemplate(templateId) : undefined;

  // F22: テンプレート指定時は添付許可フラグを尊重する。
  // 直接入力（テンプレート無し）の場合はユーザーの明示的な判断として許可
  if (attachmentIds.length > 0 && template && !template.allow_attachments) {
    return NextResponse.json(
      {
        error: "このテンプレートでは資料を添付できません",
        reasons: [
          "初回メールへの添付は迷惑メール判定や警戒を招くため既定で禁止しています。返信後に使うテンプレートで「資料の添付を許可」をONにしてください",
        ],
      },
      { status: 422 }
    );
  }
  // {{AI:...}} ゾーンがあれば、宛先企業の分析データを引いてAI生成に使う
  let companyAnalysis: AnalysisResult | null = null;
  if (hasAiZones(mailBody) && registeredContact?.company_id) {
    const comp = getCompanyById(registeredContact.company_id);
    if (comp?.analysis_json) {
      try {
        companyAnalysis = JSON.parse(comp.analysis_json) as AnalysisResult;
      } catch { /* malformed JSON — proceed without analysis */ }
    }
  }

  let outgoingBody: string;
  try {
    const composed = await composeBody({
      mode: template?.compose_mode ?? "fixed_only",
      fixedPart: template?.fixed_part ?? "",
      aiBrief: template?.ai_brief ?? "",
      body: mailBody,
      variables,
      service,
      persona,
      companyName: company,
      analysis: companyAnalysis,
    });
    outgoingBody = composed.body;
  } catch (err) {
    console.error("compose failed:", err);
    return NextResponse.json(
      { error: "本文の作成に失敗しました" },
      { status: 502 }
    );
  }

  // F4/F9: 差し込み変数を解決。値が無い変数は原文のまま残り、下の送信ガードが弾く
  const resolved = resolveEmailVariables(subject, outgoingBody, variables);
  const outgoingSubject = resolved.subject;
  outgoingBody = resolved.body;

  // hybrid で固定部分が崩れていないかを送信直前に検証する（仕様書F4）
  if (
    template?.compose_mode === "hybrid" &&
    !verifyFixedPartIntact(outgoingBody, template.fixed_part, variables)
  ) {
    return NextResponse.json(
      {
        error: "固定文が書き換わっているため送信できません",
        reasons: ["テンプレートの固定部分と本文の冒頭が一致しません"],
      },
      { status: 422 }
    );
  }

  // Guard runs against the real recipient even in test mode (same as /api/send)
  const guardResult = runSendGuard({
    toEmail: rawToEmail,
    subject: outgoingSubject,
    body: outgoingBody,
    senderId,
    acknowledgedWarnings: !!body.acknowledgedWarnings,
  });

  if (!guardResult.canSend) {
    return NextResponse.json(
      { error: "送信ガードにより送信できません", reasons: guardResult.reasons },
      { status: 422 }
    );
  }

  // F18: 事実誤認の検知。テンプレートに相手企業固有の数値が書かれていれば
  // 「御社の◯◯」の形で拾われる。企業名が空なら社名照合は成立しないので警告に落ちる
  {
    const danger = runDangerCheck({
      subject: outgoingSubject,
      body: outgoingBody,
      analysis: analysisForCheck,
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
    service_id: service.id,
    persona_id: persona.id,
    subject: outgoingSubject,
    body: outgoingBody,
    generated_subject: outgoingSubject,
    generated_body: outgoingBody,
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
      subject: outgoingSubject,
      body: outgoingBody,
      unsubscribeEmail,
      attachments,
    });

    createSendLog({
      prospect_id: prospect.id,
      sender_id: senderId,
      to_email: toEmail,
      subject: outgoingSubject,
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
