import { NextRequest, NextResponse } from "next/server";
import { getRecentActivity } from "@/lib/activity-log";

export function GET(request: NextRequest) {
  const afterId = Number(request.nextUrl.searchParams.get("after") ?? 0);
  return NextResponse.json({ entries: getRecentActivity(afterId) });
}
