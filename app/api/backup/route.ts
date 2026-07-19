import { NextResponse } from "next/server";
import path from "path";
import { backupDatabase } from "@/lib/backup";

export async function POST() {
  try {
    const backupPath = backupDatabase();
    // 絶対パスはサーバの構成を晒すのでファイル名だけ返す
    return NextResponse.json({ success: true, filename: path.basename(backupPath) });
  } catch (err) {
    // 生のエラーには絶対パスが含まれるためログにとどめる
    console.error("backup failed:", err);
    return NextResponse.json({ error: "バックアップに失敗しました" }, { status: 500 });
  }
}
