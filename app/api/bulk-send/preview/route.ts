import { NextRequest, NextResponse } from "next/server";
import {
  getSender,
  getService,
  getPersona,
  getAllServices,
  getAllPersonas,
  getTemplate,
  getContactByEmail,
  getSetting,
} from "@/lib/db";
import { resolveEmailVariables } from "@/lib/variables";
import { composeBody, hasAiZones } from "@/lib/compose";
import { resolveAnalysisForRecipient } from "@/lib/company-analysis";
import type { Persona, Service } from "@/lib/types";

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 一括送信のプレビュー生成API。
 * bulk-send と同じ処理（企業分析→AI生成→変数解決）を行うが、送信はしない。
 * 生成結果の件名・本文を返す。
 */
export async function POST(request: NextRequest) {
  let body: {
    senderId: number;
    templateId?: number;
    company: string;
    person: string;
    email: string;
    subject: string;
    body: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const senderId = Number(body.senderId);
  const templateId = Number(body.templateId) || 0;
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const mailBody = typeof body.body === "string" ? body.body : "";

  if (!senderId || !rawEmail) {
    return NextResponse.json({ error: "senderId, email are required" }, { status: 400 });
  }

  if (!EMAIL_PATTERN.test(rawEmail)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません" },
      { status: 400 }
    );
  }

  if (!subject.trim() && !mailBody.trim()) {
    return NextResponse.json(
      { error: "件名・本文が空です" },
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

  const registeredContact = getContactByEmail(rawEmail);
  const recipientLpUrl = registeredContact?.lp_url || service?.lp_url || undefined;

  const personRaw = typeof body.person === "string" ? body.person.trim() : "";
  const variables = {
    company_name: company,
    person_name: personRaw || "ご担当者",
    sender_name: persona?.name,
    service_name: service?.name,
    lp_url: recipientLpUrl,
    booking_url: sender.booking_url,
  };

  const template = templateId ? getTemplate(templateId) : undefined;

  let companyAnalysis = null;
  let analysisFailed = false;
  if (hasAiZones(mailBody)) {
    try {
      companyAnalysis = await resolveAnalysisForRecipient(company, rawEmail, service);
    } catch (err) {
      console.error("preview: company analysis resolution failed:", err);
      analysisFailed = true;
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
    console.error("preview: compose failed:", err);
    return NextResponse.json(
      { error: "本文の生成に失敗しました" },
      { status: 502 }
    );
  }

  const resolved = resolveEmailVariables(subject, outgoingBody, variables);

  const warnings: string[] = [];
  if (analysisFailed) {
    warnings.push("企業分析に失敗したため、汎用文面で生成しました");
  }

  return NextResponse.json({
    subject: resolved.subject,
    body: resolved.body,
    unresolved: resolved.unresolved,
    ...(warnings.length > 0 && { warnings }),
  });
}
