import { NextResponse } from "next/server";
import { getAllProspects } from "@/lib/db";

const STATUS_LABELS: Record<string, string> = {
  unsent: "未送信",
  sent: "送信済",
  replied: "返信あり",
  meeting: "商談中",
  rejected: "見送り",
};

const COMPAT_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function GET() {
  const prospects = getAllProspects();
  const header = ["ID", "日付", "会社名", "ドメイン", "相性", "ステータス", "件名", "URL"];
  const rows = prospects.map((p) => [
    String(p.id),
    p.created_at,
    p.company_name || p.domain,
    p.domain,
    COMPAT_LABELS[p.compatibility_score] ?? p.compatibility_score,
    STATUS_LABELS[p.send_status] ?? p.send_status,
    p.subject,
    p.input_url,
  ]);

  const bom = "﻿";
  const csv = bom + [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prospects_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
