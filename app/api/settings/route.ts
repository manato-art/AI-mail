import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { MIN_PASSWORD_LENGTH, getAppPassword, isAuthEnabled } from "@/lib/auth";

const KEYS = [
  "sender_email",
  "default_service_id",
  "default_persona_id",
  "serper_api_key",
  "search_mode",
] as const;

/** APIキーは画面に出さない（CLAUDE.md 制約6）。設定済みかどうかだけ返す */
const SECRET_KEYS = new Set<string>(["serper_api_key"]);

export function GET() {
  const result: Record<string, string> = {};
  for (const key of KEYS) {
    const value = getSetting(key) ?? "";
    result[key] = SECRET_KEYS.has(key) ? "" : value;
    if (SECRET_KEYS.has(key)) {
      result[`${key}_configured`] = value ? "true" : "false";
    }
  }
  result.test_mode = process.env.TEST_MODE_RECIPIENT ? "true" : "false";
  result.auth_enabled = isAuthEnabled() ? "true" : "false";
  result.auth_password_weak =
    isAuthEnabled() && getAppPassword().length < MIN_PASSWORD_LENGTH ? "true" : "false";
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const data = await request.json();
  for (const key of KEYS) {
    if (typeof data[key] !== "string") continue;
    const value = data[key].trim();
    // GET はキーを空でしか返さないため、空の送信は「変更なし」として既存値を保持する
    if (SECRET_KEYS.has(key) && value === "") continue;
    setSetting(key, value);
  }

  const result: Record<string, string> = {};
  for (const key of KEYS) {
    const value = getSetting(key) ?? "";
    result[key] = SECRET_KEYS.has(key) ? "" : value;
    if (SECRET_KEYS.has(key)) {
      result[`${key}_configured`] = value ? "true" : "false";
    }
  }
  return NextResponse.json(result);
}
