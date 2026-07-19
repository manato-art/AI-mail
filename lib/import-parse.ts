import ExcelJS from "exceljs";
import Encoding from "encoding-japanese";

/**
 * 営業リストの取込（仕様書 F8）。
 * CSV（UTF-8 / Shift_JIS 自動判定）と Excel(.xlsx) を同じ形に正規化する。
 */

export interface ParsedSheet {
  /** 1行目（ヘッダー候補）。ヘッダー無しと判断した場合は空配列 */
  headers: string[];
  /** ヘッダーを除いたデータ行 */
  rows: string[][];
}

export const MAX_IMPORT_ROWS = 5000;

/** ヘッダー行らしさの判定に使う語。列マッピングの初期値決めにも使う */
const HEADER_HINTS = [
  "会社", "企業", "法人", "社名", "company", "組織",
  "氏名", "名前", "担当", "person", "name", "姓", "名",
  "メール", "mail", "email", "アドレス", "e-mail",
  "部署", "役職", "department", "title", "肩書",
  "電話", "tel", "phone", "住所", "address", "url",
];

function decodeCsvBuffer(buffer: Buffer): string {
  const bytes = new Uint8Array(buffer);
  // 日本語の営業リストは Shift_JIS で書き出されることが多い。
  // 自動判定に任せると UTF-8 との取り違えで文字化けするので、
  // encoding-japanese の判定結果を明示して UNICODE へ変換する
  const detected = Encoding.detect(bytes) || "UTF8";
  const converted = Encoding.convert(bytes, { to: "UNICODE", from: detected });
  return Encoding.codeToString(converted).replace(/^﻿/, "");
}

/** RFC4180 相当の CSV パース（引用符内のカンマ・改行・""エスケープに対応） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (char === "," || char === "\t") { row.push(field); field = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values: string[] = [];
    // exceljs の row.values は 1-origin で先頭に空要素が入る
    const raw = Array.isArray(excelRow.values) ? excelRow.values.slice(1) : [];
    for (const cell of raw) {
      values.push(cellToString(cell));
    }
    if (values.some((v) => v.trim() !== "")) rows.push(values);
  });
  return rows;
}

/** ハイパーリンク付きセルや数式セルも文字列にする */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const obj = value as { text?: unknown; result?: unknown; hyperlink?: unknown; richText?: { text: string }[] };
    if (Array.isArray(obj.richText)) return obj.richText.map((t) => t.text).join("");
    if (typeof obj.text === "string") return obj.text;
    if (obj.result !== undefined) return cellToString(obj.result);
    if (typeof obj.hyperlink === "string") return obj.hyperlink;
  }
  return "";
}

function looksLikeHeader(row: string[]): boolean {
  const joined = row.join("").toLowerCase();
  if (!joined) return false;
  // メールアドレスが入っている行はデータ行
  if (row.some((cell) => cell.includes("@"))) return false;
  return HEADER_HINTS.some((hint) => joined.includes(hint));
}

export async function parseImportFile(
  filename: string,
  buffer: Buffer
): Promise<ParsedSheet> {
  const isExcel = /\.xlsx?$/i.test(filename);
  const table = isExcel ? await parseXlsx(buffer) : parseCsv(decodeCsvBuffer(buffer));

  if (table.length === 0) return { headers: [], rows: [] };

  const [first, ...rest] = table;
  if (looksLikeHeader(first)) {
    return { headers: first.map((h) => h.trim()), rows: rest.slice(0, MAX_IMPORT_ROWS) };
  }
  return { headers: [], rows: table.slice(0, MAX_IMPORT_ROWS) };
}

export type ColumnKind = "company" | "person" | "email" | "lp_url" | "ignore";

/** 列名から用途を推測する。ヘッダーが無い場合は中身から推測する */
export function guessColumnKinds(headers: string[], rows: string[][]): ColumnKind[] {
  const columnCount = Math.max(headers.length, ...rows.map((r) => r.length), 0);
  const kinds: ColumnKind[] = [];

  for (let i = 0; i < columnCount; i++) {
    const header = (headers[i] ?? "").toLowerCase();
    const samples = rows.slice(0, 20).map((r) => r[i] ?? "");

    // 「メールアドレス」「Email」「e-mail」等。名刺アプリのエクスポートは表記が揺れる
    if (/メール|mail|アドレス/.test(header)) {
      kinds.push("email");
    } else if (samples.some((s) => s.includes("@"))) {
      kinds.push("email");
    } else if (/lp|ランディング/.test(header)) {
      kinds.push("lp_url");
    } else if (/会社|企業|法人|社名|company|組織|団体/.test(header)) {
      kinds.push("company");
    } else if (/部署|部門|課|役職|肩書|department|division|title|position/.test(header)) {
      // 「部署名」「役職名」を担当者名と取り違えないよう、人名判定より先に落とす
      kinds.push("ignore");
    } else if (/氏名|名前|担当|person|フルネーム|姓|first.?name|last.?name|\bname\b/.test(header)) {
      kinds.push("person");
    } else {
      // 部署・役職・電話・住所などは取り込まない（宛先の構成に使わない）
      kinds.push("ignore");
    }
  }

  // ヘッダーが無いときだけ、メール列以外を左から会社名・担当者名に割り当てる。
  // ヘッダーがある場合に埋めてしまうと、「部署名」等を意図的に ignore にした判断を
  // 上書きして担当者名として取り込んでしまう
  if (headers.length === 0) {
    if (!kinds.includes("company")) {
      const idx = kinds.findIndex((k) => k === "ignore");
      if (idx >= 0) kinds[idx] = "company";
    }
    if (!kinds.includes("person")) {
      const idx = kinds.findIndex((k) => k === "ignore");
      if (idx >= 0) kinds[idx] = "person";
    }
  }

  return kinds;
}
