import { NextResponse } from "next/server";
import { getAllTemplates, createTemplate, getTemplateAttachments } from "@/lib/db";
import type { TemplateWithAttachments } from "@/lib/types";
import { normalizeComposeMode } from "@/lib/compose";

export function GET() {
  const templates: TemplateWithAttachments[] = getAllTemplates().map((template) => ({
    ...template,
    attachments: getTemplateAttachments(template.id),
  }));
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const data = await request.json();
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "テンプレート名は必須です" }, { status: 400 });
  }
  const template = createTemplate({
    name,
    subject: typeof data.subject === "string" ? data.subject : "",
    body: typeof data.body === "string" ? data.body : "",
    compose_mode: normalizeComposeMode(data.compose_mode),
    fixed_part: typeof data.fixed_part === "string" ? data.fixed_part : "",
    ai_brief: typeof data.ai_brief === "string" ? data.ai_brief : "",
  });
  return NextResponse.json(template, { status: 201 });
}
