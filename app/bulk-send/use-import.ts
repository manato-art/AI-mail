"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ColumnKind } from "@/lib/import-parse";
import { uid, type Recipient } from "./shared";

/**
 * スプシ貼り付け / CSV・Excel 取込の状態と処理（page.tsx から移動しただけ）。
 * 列マッピング・既存宛先との重複スキップ・個社LPの保存(F9)はそのまま。
 */

export function parseSpreadsheetText(text: string): Omit<Recipient, "id" | "checked">[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split("\t").length >= 3 ? line.split("\t") : line.split(",");
      if (cols.length < 3) return null;
      const [c0, c1, c2] = cols.map((c) => c.trim());
      const emailCol = [c0, c1, c2].find((c) => c.includes("@"));
      if (!emailCol) return null;
      const rest = [c0, c1, c2].filter((c) => c !== emailCol);
      return { company: rest[0] || "", person: rest[1] || "", email: emailCol };
    })
    .filter(Boolean) as Omit<Recipient, "id" | "checked">[];
}

interface Options {
  recipients: Recipient[];
  setRecipients: Dispatch<SetStateAction<Recipient[]>>;
  showToast: (msg: string) => void;
}

export function useImport({ recipients, setRecipients, showToast }: Options) {
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnKinds, setColumnKinds] = useState<ColumnKind[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  function handleImport() {
    const parsed = parseSpreadsheetText(pasteText);
    if (parsed.length === 0) { showToast("有効な宛先が見つかりませんでした"); return; }
    setRecipients((prev) => [...prev, ...parsed.map((p) => ({ ...p, id: uid(), checked: true }))]);
    setPasteText("");
    setImportOpen(false);
    showToast(`${parsed.length}件の宛先を追加しました`);
  }

  /**
   * ファイル取込はサーバでパースする。
   * .xlsx はZIP+XMLなのでブラウザ側の readAsText では読めない（従来はここが壊れていた）。
   * Shift_JIS の判定もサーバ側でまとめて行う。
   */
  async function handleImportFile(file: File) {
    setParsing(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "ファイルを読み取れませんでした");
        return;
      }
      setSheet({ headers: data.headers, rows: data.rows });
      setColumnKinds(data.columnKinds);
      if (data.truncated) {
        showToast(`先頭${data.rows.length}件のみ読み込みました`);
      }
    } catch {
      setImportError("ファイルの読み込みに失敗しました");
    } finally {
      setParsing(false);
    }
  }

  /** 列の割り当てを確定して宛先リストに反映する */
  function handleApplyMapping() {
    if (!sheet) return;
    const emailIdx = columnKinds.indexOf("email");
    if (emailIdx < 0) {
      setImportError("メールアドレスの列を1つ選んでください");
      return;
    }
    const companyIdx = columnKinds.indexOf("company");
    const personIdx = columnKinds.indexOf("person");
    const lpIdx = columnKinds.indexOf("lp_url");

    const seen = new Set(recipients.map((r) => r.email.trim().toLowerCase()));
    const added: Recipient[] = [];
    let skipped = 0;

    for (const row of sheet.rows) {
      const email = (row[emailIdx] ?? "").trim();
      if (!email || !email.includes("@")) { skipped++; continue; }
      const key = email.toLowerCase();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      added.push({
        id: uid(),
        company: companyIdx >= 0 ? (row[companyIdx] ?? "").trim() : "",
        person: personIdx >= 0 ? (row[personIdx] ?? "").trim() : "",
        email,
        checked: true,
      });
    }

    if (added.length === 0) {
      setImportError("追加できる宛先がありませんでした（重複またはメールアドレス不正）");
      return;
    }

    // F9: 個社LPが指定されていれば企業リストに保存し、送信時に宛先ごとのLPとして使う
    if (lpIdx >= 0) {
      const withLp = sheet.rows
        .filter((row) => (row[lpIdx] ?? "").trim() && (row[emailIdx] ?? "").includes("@"))
        .map((row) => ({
          name: companyIdx >= 0 ? (row[companyIdx] ?? "").trim() : "",
          email: (row[emailIdx] ?? "").trim(),
          personName: personIdx >= 0 ? (row[personIdx] ?? "").trim() : "",
          lpUrl: (row[lpIdx] ?? "").trim(),
        }))
        .filter((r) => r.name);

      if (withLp.length > 0) {
        fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "csv_import", sourceDetail: "列マッピング取込", rows: withLp }),
        }).catch(() => showToast("個社LPの保存に失敗しました"));
      }
    }

    setRecipients((prev) => [...prev, ...added]);
    closeImport();
    showToast(
      skipped > 0
        ? `${added.length}件を追加しました（${skipped}件はスキップ）`
        : `${added.length}件の宛先を追加しました`
    );
  }

  function closeImport() {
    setImportOpen(false);
    setSheet(null);
    setColumnKinds([]);
    setImportError(null);
    setPasteText("");
  }

  /** 「別のファイル」= 読み込んだ表だけ捨てる（モーダルは開いたまま） */
  function resetSheet() {
    setSheet(null);
    setColumnKinds([]);
    setImportError(null);
  }

  const parsedPreview = parseSpreadsheetText(pasteText);

  return {
    importOpen,
    openImport: () => setImportOpen(true),
    closeImport,
    importTab,
    setImportTab,
    pasteText,
    setPasteText,
    parsedPreview,
    handleImport,
    fileInputRef,
    handleImportFile,
    parsing,
    sheet,
    resetSheet,
    columnKinds,
    setColumnKinds,
    handleApplyMapping,
    importError,
  };
}

export type ImportApi = ReturnType<typeof useImport>;
