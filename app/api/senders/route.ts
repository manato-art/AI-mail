import { NextResponse } from "next/server";
import { getAllSenders, deleteSender, updateSenderDailyLimit } from "@/lib/db";
import { NextRequest } from "next/server";

const MAX_DAILY_LIMIT = 10000;

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

export async function PATCH(request: NextRequest) {
  let data: { id?: number; daily_limit?: number };
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = Number(data.id);
  const dailyLimit = Number(data.daily_limit);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > MAX_DAILY_LIMIT) {
    return NextResponse.json(
      { error: `daily_limit は 0〜${MAX_DAILY_LIMIT} の整数で指定してください（0 = 無制限）` },
      { status: 400 }
    );
  }

  const updated = updateSenderDailyLimit(id, dailyLimit);
  if (!updated) {
    return NextResponse.json({ error: "Sender not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    daily_limit: updated.daily_limit,
  });
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
