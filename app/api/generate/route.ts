import { NextRequest, NextResponse } from "next/server";
import {
  getService,
  getPersona,
  getTemplate,
  findProspectByDomain,
  createProspect,
} from "@/lib/db";
import { validateUrl } from "@/lib/ssrf";
import { crawlWebsite } from "@/lib/crawl";
import { analyzeCompany } from "@/lib/analyze";
import { generateEmail } from "@/lib/generate";
import { validateEmail } from "@/lib/quality-check";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, personaId, url, force, forceLow, tone, length, cta, additionalInstructions, templateId } = body ?? {};

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

    const crawlResult = await crawlWebsite(validated.normalized);
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
      send_status: "unsent",
    });

    return NextResponse.json({ prospect, qualityCheck });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
