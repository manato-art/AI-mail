import { NextResponse } from "next/server";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/db";
import { normalizeComposeMode } from "@/lib/compose";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = getTemplate(Number(id));
  if (!template) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await request.json();
  // req.body 素通しだと compose_mode に未知の値を入れられるので明示的に組み直す
  const updated = updateTemplate(Number(id), {
    name: typeof data.name === "string" ? data.name : undefined,
    subject: typeof data.subject === "string" ? data.subject : undefined,
    body: typeof data.body === "string" ? data.body : undefined,
    compose_mode:
      data.compose_mode === undefined ? undefined : normalizeComposeMode(data.compose_mode),
    fixed_part: typeof data.fixed_part === "string" ? data.fixed_part : undefined,
    ai_brief: typeof data.ai_brief === "string" ? data.ai_brief : undefined,
  });
  if (!updated) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteTemplate(Number(id));
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
