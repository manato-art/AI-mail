import { NextResponse } from "next/server";
import { updateProspectStatus } from "@/lib/db";

const VALID_STATUSES = ["unsent", "sent", "replied", "meeting", "rejected"];

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await request.json();
  const status = typeof data.status === "string" ? data.status : "";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
  }
  const updated = updateProspectStatus(Number(id), status);
  if (!updated) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json(updated);
}
