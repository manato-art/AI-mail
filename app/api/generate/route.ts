import { NextRequest, NextResponse } from "next/server";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
  InternalServerError,
} from "@anthropic-ai/sdk";
import {
  getService,
  getPersona,
  getTemplate,
  findProspectByDomain,
  createProspect,
  addSuppression,
} from "@/lib/db";
import { validateUrl } from "@/lib/ssrf";
import { crawlWebsiteWithRefusal } from "@/lib/crawl";
import { analyzeCompany } from "@/lib/analyze";
import { generateEmail } from "@/lib/generate";
import { validateEmail } from "@/lib/quality-check";

function classifyError(error: unknown): { message: string; status: number; retryable: boolean } {
  if (error instanceof RateLimitError) {
    return { message: "AI APIの利用制限に達しました。しばらく待ってから再試行してください", status: 429, retryable: true };
  }
  if (error instanceof InternalServerError) {
    return { message: "AI APIが一時的に不安定です。しばらく待ってから再試行してください", status: 502, retryable: true };
  }
  if (error instanceof APIConnectionTimeoutError) {
    return { message: "AI APIへの接続がタイムアウトしました。再試行してください", status: 504, retryable: true };
  }
  if (error instanceof APIConnectionError) {
    return { message: "AI APIへの接続に失敗しました。再試行してください", status: 502, retryable: true };
  }
  if (error instanceof Error) {
    if (error.message.includes("分析APIエラー") || error.message.includes("分析がブロック")) {
      return { message: error.message, status: 502, retryable: true };
    }
    if (error.message.includes("JSONパース")) {
      const stage = error.message.includes("分析") ? "分析" : error.message.includes("生成") ? "生成" : "";
      const detail = error.message.includes("応答切れ") ? "（応答が途中で切れました）" : "";
      return { message: `AIの応答を解析できませんでした${stage ? `（${stage}段階）` : ""}${detail}。再試行してください`, status: 502, retryable: true };
    }
    if (error.message.includes("テキストを取得できません")) {
      return { message: "AIから有効な応答がありませんでした。再試行してください", status: 502, retryable: true };
    }
  }
  return { message: "サーバーエラーが発生しました", status: 500, retryable: false };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, personaId, url, force, forceLow, tone, length, cta, additionalInstructions, fixedText, templateId } = body ?? {};

    if (!serviceId || !personaId || !url) {
      return NextResponse.json(
        { error: "サービス・人格・URLをすべて入力してください" },
        { status: 400 }
      );
    }

    const validated = validateUrl(url);

    if (!validated.valid) {
      return NextResponse.json(
        { error: validated.error ?? "URLの形式が不正です" },
        { status: 400 }
      );
    }

    const domain = new URL(validated.normalized).hostname;

    if (!force) {
      const existingProspect = findProspectByDomain(domain);
      if (existingProspect) {
        return NextResponse.json(
          { duplicate: true, existingProspect },
          { status: 200 }
        );
      }
    }

    const service = getService(Number(serviceId));
    if (!service) {
      return NextResponse.json({ error: "サービスが見つかりません" }, { status: 404 });
    }

    const persona = getPersona(Number(personaId));
    if (!persona) {
      return NextResponse.json({ error: "人格が見つかりません" }, { status: 404 });
    }

    const crawlResult = await crawlWebsiteWithRefusal(validated.normalized);

    if (crawlResult.pages.length === 0) {
      return NextResponse.json(
        { error: "サイトの情報を取得できませんでした。URLを確認するか、しばらく待ってから再試行してください" },
        { status: 422 }
      );
    }

    if (crawlResult.hasRefusal && crawlResult.contactEmails.length > 0) {
      for (const email of crawlResult.contactEmails) {
        addSuppression({
          target: email,
          target_type: "email",
          reason: "refusal_detected",
          note: crawlResult.refusalText ?? "営業お断り表記を検出",
        });
      }
    }

    const analysis = await analyzeCompany(crawlResult, service);

    if (analysis.compatibility.score === "low" && !forceLow) {
      return NextResponse.json(
        { lowCompatibility: true, analysis },
        { status: 200 }
      );
    }

    const isFormOnly =
      crawlResult.contactEmails.length === 0 && Boolean(crawlResult.formUrl);

    const template = templateId ? getTemplate(Number(templateId)) : undefined;
    const genOptions = {
      tone,
      length,
      cta,
      additionalInstructions,
      fixedText: typeof fixedText === "string" ? fixedText : undefined,
      templateSubject: template?.subject,
      templateBody: template?.body,
    };

    let generation = await generateEmail(analysis, service, persona, isFormOnly, genOptions);
    let qualityCheck = validateEmail(generation.body, generation.subject, analysis);

    if (!qualityCheck.passed) {
      generation = await generateEmail(analysis, service, persona, isFormOnly, genOptions);
      qualityCheck = validateEmail(generation.body, generation.subject, analysis);
    }

    const prospect = createProspect({
      input_url: validated.normalized,
      domain,
      company_name: analysis.company_name,
      analysis_json: JSON.stringify(analysis),
      service_id: service.id,
      persona_id: persona.id,
      subject: generation.subject,
      body: generation.body,
      generated_subject: generation.subject,
      generated_body: generation.body,
      emails_found_json: crawlResult.contactEmails.length
        ? JSON.stringify(crawlResult.contactEmails)
        : null,
      form_url: crawlResult.formUrl,
      is_form_only: isFormOnly ? 1 : 0,
      compatibility_score: analysis.compatibility.score,
      has_refusal: crawlResult.hasRefusal ? 1 : 0,
      refusal_text: crawlResult.refusalText,
      send_status: "unsent",
    });

    return NextResponse.json({ prospect, qualityCheck });
  } catch (error) {
    console.error("[generate]", error);
    const classified = classifyError(error);
    return NextResponse.json(
      { error: classified.message, retryable: classified.retryable },
      { status: classified.status }
    );
  }
}
