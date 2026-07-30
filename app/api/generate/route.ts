import { NextRequest, NextResponse } from "next/server";
import { classifyGenerateError, type GenerateStage } from "@/lib/generate-error";
import {
  getService,
  getPersona,
  getTemplate,
  findProspectByDomain,
  hasSentToCompanyDomain,
  createProspect,
  addSuppression,
} from "@/lib/db";
import { validateUrl } from "@/lib/ssrf";
import { crawlWebsiteWithRefusal } from "@/lib/crawl";
import { analyzeCompany } from "@/lib/analyze";
import { generateEmail } from "@/lib/generate";
import { composeFromTemplate } from "@/lib/compose";
import { validateEmail } from "@/lib/quality-check";
import type { GenerationResult } from "@/lib/types";

export async function POST(request: NextRequest) {
  // どの段階で落ちたかを失敗時に必ず残す（分類できない例外の手掛かりになる）
  let stage: GenerateStage = "準備";
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

    // 送信済みの会社にはメールを作らない。force（まとめて生成）でも解除しない。
    // force は「生成済みでも作り直す」意思表示であって「送った相手にまた作る」承認ではない。
    // ここが無いと、送れない相手のためにAI生成の費用と時間を捨てる（2026-07-27 報告）。
    if (hasSentToCompanyDomain(domain)) {
      return NextResponse.json(
        {
          alreadySent: true,
          skipReason: "送信済みの会社です",
          domain,
        },
        { status: 200 }
      );
    }

    const service = getService(Number(serviceId));
    if (!service) {
      return NextResponse.json({ error: "サービスが見つかりません" }, { status: 404 });
    }

    const persona = getPersona(Number(personaId));
    if (!persona) {
      return NextResponse.json({ error: "人格が見つかりません" }, { status: 404 });
    }

    stage = "サイト読み取り";
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

    stage = "分析";
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
    const fromTemplate = Boolean(template);

    stage = "生成";
    let generation: GenerationResult;
    if (template) {
      // テンプレは compose エンジンで処理する（固定文保持・{{AI:}}のみ生成・変数置換）。
      // generateEmail（型プロンプト）に渡すとテンプレ本文が書き換わるため通さない。
      generation = await composeFromTemplate(template, analysis, service, persona);
    } else {
      const genOptions = {
        tone,
        length,
        cta,
        additionalInstructions,
        fixedText: typeof fixedText === "string" ? fixedText : undefined,
      };
      generation = await generateEmail(analysis, service, persona, isFormOnly, genOptions);
      // 品質チェックが通らなければ一度だけ再生成（自由生成のみ。テンプレは再生成しない）
      if (!validateEmail(generation.body, generation.subject, analysis).passed) {
        generation = await generateEmail(analysis, service, persona, isFormOnly, genOptions);
      }
    }

    const qualityCheck = validateEmail(generation.body, generation.subject, analysis, { fromTemplate });

    stage = "保存";
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
      template_id: templateId ? Number(templateId) : null,
      send_status: "unsent",
    });

    return NextResponse.json({ prospect, qualityCheck });
  } catch (error) {
    console.error(`[generate] stage=${stage}`, error);
    const classified = classifyGenerateError(error, stage);
    return NextResponse.json(
      // fatal = 残高・キー・モデル等のアカウント側の問題。どの会社でも同じく失敗するので
      // 一括生成側はこれが続いたら残りを止める（無駄な調査費を出さない）
      { error: classified.message, retryable: classified.retryable, fatal: classified.fatal ?? false },
      { status: classified.status }
    );
  }
}
