import { NextRequest, NextResponse } from "next/server";
import { getAllSuppressions, addSuppression, deleteSuppression } from "@/lib/db";
import type { SuppressionReason, SuppressionTargetType } from "@/lib/types";

export async function GET() {
  const suppressions = getAllSuppressions();
  return NextResponse.json(suppressions);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { target, target_type, reason, note } = body as {
    target?: string;
    target_type?: SuppressionTargetType;
    reason?: SuppressionReason;
    note?: string;
  };

  if (!target || !target_type || !reason) {
    return NextResponse.json(
      { error: "target, target_type, reason are required" },
      { status: 400 }
    );
  }

  const suppression = addSuppression({ target, target_type, reason, note });
  return NextResponse.json(suppression, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const deleted = deleteSuppression(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
