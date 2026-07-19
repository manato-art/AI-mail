import { NextRequest, NextResponse } from "next/server";
import { MAX_IMPORT_ROWS, guessColumnKinds, parseImportFile } from "@/lib/import-parse";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(csv|tsv|txt|xlsx|xls)$/i;

export async function POST(request: NextRequest) {
  let file: FormDataEntryValue | null;
  try {
    const formData = await request.formData();
    file = formData.get("file");
  } catch {
    return NextResponse.json({ error: "ファイルの受け取りに失敗しました" }, { status: 400 });
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "空のファイルです" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `ファイルが大きすぎます（上限${MAX_FILE_BYTES / 1024 / 1024}MB）` },
      { status: 400 }
    );
  }
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    return NextResponse.json(
      { error: "CSV・Excel（.xlsx）ファイルを選択してください" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = await parseImportFile(file.name, buffer);

    if (rows.length === 0) {
      return NextResponse.json({ error: "読み取れる行がありませんでした" }, { status: 400 });
    }

    return NextResponse.json({
      headers,
      rows,
      columnKinds: guessColumnKinds(headers, rows),
      truncated: rows.length >= MAX_IMPORT_ROWS,
    });
  } catch (err) {
    // 破損ファイルの生エラーは内部構造を晒すのでログにとどめる
    console.error("import parse failed:", err);
    return NextResponse.json(
      { error: "ファイルを読み取れませんでした。形式をご確認ください" },
      { status: 400 }
    );
  }
}
