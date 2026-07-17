import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

const KEYS = ["sender_email", "default_service_id", "default_persona_id", "eight_api_key"] as const;

export function GET() {
  const result: Record<string, string> = {};
  for (const key of KEYS) {
    result[key] = getSetting(key) ?? "";
  }
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const data = await request.json();
  for (const key of KEYS) {
    if (typeof data[key] === "string") {
      setSetting(key, data[key].trim());
    }
  }
  const result: Record<string, string> = {};
  for (const key of KEYS) {
    result[key] = getSetting(key) ?? "";
  }
  return NextResponse.json(result);
}
