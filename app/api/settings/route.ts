import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export function GET() {
  const senderEmail = getSetting("sender_email") ?? "";
  return NextResponse.json({ sender_email: senderEmail });
}

export async function PUT(request: Request) {
  const data = await request.json();
  if (typeof data.sender_email === "string") {
    setSetting("sender_email", data.sender_email.trim());
  }
  const senderEmail = getSetting("sender_email") ?? "";
  return NextResponse.json({ sender_email: senderEmail });
}
