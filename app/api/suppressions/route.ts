import { NextRequest, NextResponse } from "next/server";
import { getAllSuppressions, addSuppression, deleteSuppression } from "@/lib/db";
import type { SuppressionReason, SuppressionTargetType } from "@/lib/types";

const TARGET_TYPES: SuppressionTargetType[] = ["email", "domain"];
const REASONS: SuppressionReason[] = [
  "optout",
  "bounce",
  "refusal_detected",
  "rejected_reply",
  "manual",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export async function GET() {
  return NextResponse.json(getAllSuppressions());
}

export async function POST(request: NextRequest) {
  let body: { target?: string; target_type?: string; reason?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const target = typeof body.target === "string" ? body.target.trim() : "";
  const targetType = body.target_type as SuppressionTargetType;
  const reason = body.reason as SuppressionReason;

  if (!target) {
    return NextResponse.json({ error: "対象を入力してください" }, { status: 400 });
  }

  // union を検証しないと 'email'/'domain' 以外の値が保存され、
  // 一覧には出るのに照合されない“効かない抑止レコード”ができる
  if (!TARGET_TYPES.includes(targetType)) {
    return NextResponse.json({ error: "対象の種別が不正です" }, { status: 400 });
  }
  if (!REASONS.includes(reason)) {
    return NextResponse.json({ error: "理由の値が不正です" }, { status: 400 });
  }

  const normalized = target.toLowerCase().replace(/^@/, "");
  if (targetType === "email" && !EMAIL_PATTERN.test(normalized)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません" },
      { status: 400 }
    );
  }
  if (targetType === "domain" && !DOMAIN_PATTERN.test(normalized)) {
    return NextResponse.json(
      { error: "ドメインの形式が正しくありません（例: example.com）" },
      { status: 400 }
    );
  }

  const suppression = addSuppression({
    target,
    target_type: targetType,
    reason,
    note: typeof body.note === "string" ? body.note.trim() : "",
  });
  return NextResponse.json(suppression, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  let id: unknown;
  try {
    const body = await request.json();
    id = body?.id;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Number.isInteger(Number(id))) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!deleteSuppression(Number(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
