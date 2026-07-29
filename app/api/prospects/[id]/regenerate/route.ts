import { NextRequest, NextResponse } from "next/server";
import { getProspect, getService, getPersona, getTemplate, updateProspect } from "@/lib/db";
import { generateEmail } from "@/lib/generate";
import { composeFromTemplate } from "@/lib/compose";
import { classifyGenerateError } from "@/lib/generate-error";
import type { AnalysisResult } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prospect = getProspect(Number(id));

    if (!prospect) {
      return NextResponse.json({ error: "生成履歴が見つかりません" }, { status: 404 });
    }

    const service = getService(prospect.service_id);
    if (!service) {
      return NextResponse.json({ error: "サービスが見つかりません" }, { status: 404 });
    }

    const persona = getPersona(prospect.persona_id);
    if (!persona) {
      return NextResponse.json({ error: "人格が見つかりません" }, { status: 404 });
    }

    const analysis: AnalysisResult = JSON.parse(prospect.analysis_json);
    const isFormOnly = Boolean(prospect.is_form_only);

    // テンプレ由来のprospectは再生成でもテンプレを尊重する（固定文を書き換えない）。
    // これをしないと「再生成」でテンプレが消え全文自由生成に化ける。
    const template = prospect.template_id ? getTemplate(prospect.template_id) : undefined;
    const generation = template
      ? await composeFromTemplate(template, analysis, service, persona)
      : await generateEmail(analysis, service, persona, isFormOnly);

    const updated = updateProspect(Number(id), {
      subject: generation.subject,
      body: generation.body,
      generated_subject: generation.subject,
      generated_body: generation.body,
    });

    if (!updated) {
      return NextResponse.json({ error: "生成履歴が見つかりません" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    // 再生成も同じAI経路。原因を汎用500に潰さない（/api/generate と同じ分類を使う）
    console.error("[regenerate]", error);
    const classified = classifyGenerateError(error, "生成");
    return NextResponse.json(
      { error: classified.message, retryable: classified.retryable },
      { status: classified.status }
    );
  }
}
