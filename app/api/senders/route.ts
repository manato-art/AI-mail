import { NextResponse } from "next/server";
import {
  getAllSenders,
  deleteSender,
  updateSenderDailyLimit,
  updateSenderBooking,
} from "@/lib/db";
import { NextRequest } from "next/server";
import type { BookingTool, Sender } from "@/lib/types";

const MAX_DAILY_LIMIT = 10000;
const BOOKING_TOOLS: BookingTool[] = ["calendly", "timerex", "spir", "google", "other"];

/** リフレッシュトークンを画面に出さないための整形 */
function toPublicSender(s: Sender) {
  return {
    id: s.id,
    email: s.email,
    display_name: s.display_name,
    auth_status: s.auth_status,
    daily_limit: s.daily_limit,
    booking_tool: s.booking_tool,
    booking_url: s.booking_url,
    created_at: s.created_at,
  };
}

export async function GET() {
  return NextResponse.json(getAllSenders().map(toPublicSender));
}

export async function PATCH(request: NextRequest) {
  let data: {
    id?: number;
    daily_limit?: number;
    booking_tool?: string;
    booking_url?: string;
  };
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (data.daily_limit !== undefined) {
    const dailyLimit = Number(data.daily_limit);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > MAX_DAILY_LIMIT) {
      return NextResponse.json(
        { error: `daily_limit は 0〜${MAX_DAILY_LIMIT} の整数で指定してください（0 = 無制限）` },
        { status: 400 }
      );
    }
    if (!updateSenderDailyLimit(id, dailyLimit)) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }
  }

  if (data.booking_url !== undefined || data.booking_tool !== undefined) {
    // 片方だけ送られたとき、もう片方を既定値で潰さない（部分更新でのデータ消失を防ぐ）
    const current = getAllSenders().find((s) => s.id === id);
    if (!current) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }
    const tool = (data.booking_tool ?? current.booking_tool) as BookingTool;
    const url = (data.booking_url ?? current.booking_url).trim();

    if (!BOOKING_TOOLS.includes(tool)) {
      return NextResponse.json({ error: "booking_tool の値が不正です" }, { status: 400 });
    }
    if (url && !/^https:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "日程調整URLは https:// で始まる必要があります" },
        { status: 400 }
      );
    }
    if (!updateSenderBooking(id, { booking_tool: tool, booking_url: url })) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }
  }

  const updated = getAllSenders().find((s) => s.id === id);
  if (!updated) {
    return NextResponse.json({ error: "Sender not found" }, { status: 404 });
  }
  return NextResponse.json(toPublicSender(updated));
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
