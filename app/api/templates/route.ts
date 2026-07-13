import { NextResponse } from "next/server";
import { getAllTemplates, createTemplate } from "@/lib/db";

export function GET() {
  return NextResponse.json(getAllTemplates());
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
  });
  return NextResponse.json(template, { status: 201 });
}
