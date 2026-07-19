import { NextResponse } from "next/server";
import { getAllSenders, deleteSender } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const senders = getAllSenders().map((s) => ({
    id: s.id,
    email: s.email,
    display_name: s.display_name,
    auth_status: s.auth_status,
    daily_limit: s.daily_limit,
    created_at: s.created_at,
  }));
  return NextResponse.json(senders);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const deleted = deleteSender(id);
  if (!deleted) {
    return NextResponse.json({ error: "Sender not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
