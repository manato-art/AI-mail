import { NextResponse } from "next/server";
import { backupDatabase } from "@/lib/backup";

export async function POST() {
  try {
    const path = backupDatabase();
    return NextResponse.json({ success: true, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
