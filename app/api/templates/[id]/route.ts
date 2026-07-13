import { NextResponse } from "next/server";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = getTemplate(Number(id));
  if (!template) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await request.json();
  const updated = updateTemplate(Number(id), data);
  if (!updated) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteTemplate(Number(id));
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
