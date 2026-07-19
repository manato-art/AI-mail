import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "OAuth credentials not configured" },
      { status: 500 }
    );
  }
}
