import { NextRequest, NextResponse } from "next/server";
import { getProspectsByEmail, updateProspectStatus } from "@/lib/db";

/**
 * F14: 日程調整ツールの予約完了 Webhook。
 *
 * 署名を検証しないと、URLを知った第三者が任意の宛先のステータスを
 * 書き換えられてしまうため、署名鍵が未設定なら受け付けない。
 */

const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim() ?? "";
/** リプレイ攻撃を防ぐための許容時間 */
const MAX_SIGNATURE_AGE_SEC = 5 * 60;

const encoder = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `t=<unix>,v1=<hex>` 形式のヘッダを検証する */
async function verifySignature(header: string | null, rawBody: string): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;

  const ageSec = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSec > MAX_SIGNATURE_AGE_SEC) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(signature, expected);
}

export async function POST(request: NextRequest) {
  if (!SIGNING_KEY) {
    // 鍵が無い状態で受け付けると誰でもステータスを書き換えられる
    return NextResponse.json(
      { error: "Webhook signing key is not configured" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const valid = await verifySignature(
    request.headers.get("calendly-webhook-signature"),
    rawBody
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    payload?: { email?: string; invitee?: { email?: string } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 予約成立のみ扱う。キャンセルはステータスを戻さない（人が判断する）
  if (payload.event !== "invitee.created") {
    return NextResponse.json({ ok: true, ignored: payload.event ?? "unknown" });
  }

  const email = payload.payload?.email ?? payload.payload?.invitee?.email;
  if (!email) {
    return NextResponse.json({ ok: true, ignored: "no email in payload" });
  }

  // 送信済みのものだけ商談化にする。未送信を書き換えると履歴が壊れる
  const targets = getProspectsByEmail(email).filter((p) => p.send_status === "sent");
  for (const prospect of targets) {
    updateProspectStatus(prospect.id, "meeting");
  }

  return NextResponse.json({ ok: true, updated: targets.length });
}
