import { NextRequest, NextResponse } from "next/server";
import { getProspect, getService, getPersona, updateProspect } from "@/lib/db";
import { generateEmail } from "@/lib/generate";
import type { AnalysisResult } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prospect = getProspect(Number(id));

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    const service = getService(prospect.service_id);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const persona = getPersona(prospect.persona_id);
    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    const analysis: AnalysisResult = JSON.parse(prospect.analysis_json);
    const isFormOnly = Boolean(prospect.is_form_only);

    const generation = await generateEmail(analysis, service, persona, isFormOnly);

    const updated = updateProspect(Number(id), {
      subject: generation.subject,
      body: generation.body,
      generated_subject: generation.subject,
      generated_body: generation.body,
    });

    if (!updated) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
