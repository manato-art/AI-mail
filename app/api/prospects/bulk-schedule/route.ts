import { NextRequest, NextResponse } from "next/server";
import {
  getProspect,
  getSender,
  getService,
  getPersona,
  scheduleProspect,
} from "@/lib/db";
import { runSendGuard } from "@/lib/send-guard";
import { runDangerCheck } from "@/lib/danger-check";
import { resolveEmailVariables } from "@/lib/variables";
import type { AnalysisResult } from "@/lib/types";

function parseAnalysis(json: string): AnalysisResult | null {
  try {
    const parsed = JSON.parse(json) as AnalysisResult;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** 生成メールの宛先＝emails_found_json の先頭（フロントの firstEmailOf と同じ規則） */
function firstEmail(json: string | null): string {
  if (!json) return "";
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) && typeof arr[0] === "string" ? arr[0] : "";
  } catch {
    return "";
  }
}

/**
 * 生成済みメールを「まとめて予約」する。1リクエストで全件をサーバ側で予約状態にするため、
 * フロントの直列ループ（宛先ごとに /api/send を叩く）と違い、途中でモーダルを閉じても
 * 全件が確実に予約される（＝「50件予約したのに一部だけ予約済」を防ぐ）。
 *
 * 予約は本文送信を伴わないDB更新なので高速。ただし送信時と同じガード（送信ガード・事実誤認検知）を
 * 各prospectで再検証し、通ったものだけ予約する。弾いたものは理由付きで failed に入れて返す。
 */
export async function POST(request: NextRequest) {
  let body: {
    prospectIds?: unknown;
    senderId?: number;
    scheduledAt?: string;
    acknowledgedWarnings?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const ids = Array.isArray(body.prospectIds)
    ? [...new Set(body.prospectIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  const senderId = Number(body.senderId);
  const scheduledAtRaw = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";
  const force = !!body.acknowledgedWarnings;

  if (ids.length === 0 || !senderId || !scheduledAtRaw) {
    return NextResponse.json({ error: "prospectIds, senderId, scheduledAt は必須です" }, { status: 400 });
  }

  const when = new Date(scheduledAtRaw);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "予約日時の形式が不正です" }, { status: 400 });
  }
  if (when.getTime() <= Date.now() + 30_000) {
    return NextResponse.json({ error: "予約日時は現在より先の時刻を指定してください" }, { status: 400 });
  }
  // UTCの 'YYYY-MM-DD HH:MM:SS' で保存（getDueScheduledProspects のUTC比較と揃える）
  const scheduledAtUtc = when.toISOString().slice(0, 19).replace("T", " ");

  const sender = getSender(senderId);
  if (!sender) {
    return NextResponse.json({ error: "Sender not found" }, { status: 404 });
  }

  let scheduled = 0;
  const failed: { id: number; company: string; reason: string }[] = [];

  for (const id of ids) {
    const prospect = getProspect(id);
    if (!prospect) {
      failed.push({ id, company: `#${id}`, reason: "prospect が見つかりません" });
      continue;
    }
    const label = prospect.company_name || prospect.domain || `#${id}`;

    // 送信済み・予約済みは対象外（二重予約を防ぐ）
    if (prospect.send_status === "sent" || prospect.send_status === "scheduled") {
      failed.push({
        id,
        company: label,
        reason: prospect.send_status === "sent" ? "既に送信済み" : "既に予約済み",
      });
      continue;
    }

    const toEmail = firstEmail(prospect.emails_found_json);
    if (!toEmail) {
      failed.push({ id, company: label, reason: "宛先メールがありません" });
      continue;
    }

    const analysis = parseAnalysis(prospect.analysis_json);
    const service = getService(prospect.service_id);
    const persona = getPersona(prospect.persona_id);

    const resolved = resolveEmailVariables(prospect.subject, prospect.body, {
      company_name: prospect.company_name || analysis?.company_name,
      person_name: analysis?.representative_name ?? undefined,
      sender_name: persona?.name,
      service_name: service?.name,
      lp_url: service?.lp_url ?? undefined,
      booking_url: sender.booking_url,
    });

    // 送信時と同じ送信ガード
    const guard = runSendGuard({
      toEmail,
      subject: resolved.subject,
      body: resolved.body,
      senderId,
      prospectId: id,
      force,
    });
    if (!guard.canSend) {
      failed.push({ id, company: label, reason: guard.reasons.join(" / ") });
      continue;
    }

    // 送信時と同じ事実誤認検知（BLOCK は force でも解除しない・warn は force で押し切れる）
    if (analysis) {
      const danger = runDangerCheck({
        subject: resolved.subject,
        body: resolved.body,
        analysis,
        service,
        persona,
        toEmail,
        companyDomain: prospect.domain,
      });
      if (!danger.canSend) {
        failed.push({ id, company: label, reason: danger.blocks.join(" / ") });
        continue;
      }
      if (!force && danger.warnings.length > 0) {
        failed.push({ id, company: label, reason: `要確認: ${danger.warnings.join(" / ")}` });
        continue;
      }
    }

    // ガード通過分だけ、最終内容で予約状態にする
    scheduleProspect(id, {
      scheduledAt: scheduledAtUtc,
      senderId,
      toEmail,
      subject: resolved.subject,
      body: resolved.body,
    });
    scheduled++;
  }

  return NextResponse.json({ scheduled, failed, scheduledAt: scheduledAtUtc });
}
