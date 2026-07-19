"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  Check,
  ClockCounterClockwise,
  Eye,
  MagnifyingGlass,
  Paperclip,
  Plus,
  SpinnerGap,
  Trash,
  UploadSimple,
  Warning,
  X,
  PaperPlaneTilt,
  CaretLeft,
  CaretRight,
  FileArrowUp,
} from "@phosphor-icons/react";
import type { Attachment, Prospect, TemplateWithAttachments } from "@/lib/types";
import { Toast } from "@/components/toast";
import { resolveEmailVariables } from "@/lib/variables";

interface Recipient {
  id: string;
  company: string;
  person: string;
  email: string;
  checked: boolean;
}

interface SenderInfo {
  id: number;
  email: string;
  display_name: string;
  auth_status: string;
}

type RowSendState = "sending" | "sent" | "failed";

interface RowStatus {
  state: RowSendState;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parseSpreadsheetText(text: string): Omit<Recipient, "id" | "checked">[] {
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

export default function BulkSendPage() {
  const [templates, setTemplates] = useState<TemplateWithAttachments[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [senders, setSenders] = useState<SenderInfo[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [attachmentsLib, setAttachmentsLib] = useState<Attachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<number>>(new Set());
  const [testMode, setTestMode] = useState(false);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [isSending, setIsSending] = useState(false);
  const [allowWarnings, setAllowWarnings] = useState(false);
  /** 送信ループの中断フラグ。現在の1件を送り終えてから止まる */
  const cancelRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyChecked, setHistoryChecked] = useState<Set<number>>(new Set());

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [tplRes, pRes, sRes, sendersRes, attachRes] = await Promise.all([
          fetch("/api/templates"),
          fetch("/api/prospects"),
          fetch("/api/settings"),
          fetch("/api/senders"),
          fetch("/api/attachments"),
        ]);
        const tplData: TemplateWithAttachments[] = tplRes.ok ? await tplRes.json() : [];
        const pData: Prospect[] = pRes.ok ? await pRes.json() : [];
        const sData = sRes.ok ? await sRes.json() : {};
        const sendersData: SenderInfo[] = sendersRes.ok ? await sendersRes.json() : [];
        const attachData: Attachment[] = attachRes.ok ? await attachRes.json() : [];
        if (!cancelled) {
          setTemplates(tplData);
          setProspects(pData);
          setTestMode(sData.test_mode === "true");
          setSenders(sendersData);
          if (sendersData.length > 0) setSelectedSenderId(sendersData[0].id);
          setAttachmentsLib(attachData);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("bulk-send-import");
      if (!raw) return;
      sessionStorage.removeItem("bulk-send-import");
      const imported: { company: string; person: string; email: string }[] = JSON.parse(raw);
      if (!Array.isArray(imported) || imported.length === 0) return;
      // sessionStorage はブラウザ専用なので、遅延初期化にするとサーバ描画と
      // 食い違ってハイドレーションエラーになる。マウント後に一度だけ読むのが正しい
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecipients((prev) => [
        ...prev,
        ...imported.map((item) => ({
          id: uid(),
          company: item.company || "",
          person: item.person || "",
          email: item.email || "",
          checked: true,
        })),
      ]);
    } catch { /* ignore */ }
  }, []);

  // 送信中の離脱を警告する。閉じられると何件送ったかの記録が画面から消える
  useEffect(() => {
    if (!isSending) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSending]);

  const sorted = useMemo(
    () => [...prospects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [prospects]
  );

  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? templates.find((t) => t.id === Number(selectedTemplateId)) : undefined),
    [templates, selectedTemplateId]
  );

  const checkedRecipients = useMemo(() => recipients.filter((r) => r.checked), [recipients]);
  const checkedPreviewList = checkedRecipients;

  const clampedPreviewIndex = Math.min(previewIndex, Math.max(0, checkedPreviewList.length - 1));
  const previewRecipient = checkedPreviewList[clampedPreviewIndex];

  /**
   * プレビュー用の差し込み解決。実際の送信時はサーバ側が同じエンジンで解決する。
   * 社名の文字列置換はしない（他社向けに書かれた本文を流用する事故のもとだった）。
   */
  const buildEmail = useCallback(
    (r: Recipient) => {
      if (!selectedTemplate) return { subject: "", body: "", unresolved: [] as string[] };
      const resolved = resolveEmailVariables(selectedTemplate.subject, selectedTemplate.body, {
        company_name: r.company,
        person_name: r.person,
      });
      return { subject: resolved.subject, body: resolved.body, unresolved: resolved.unresolved };
    },
    [selectedTemplate]
  );

  function handleAddOne() {
    setRecipients((prev) => [...prev, { id: uid(), company: "", person: "", email: "", checked: true }]);
  }

  function handleUpdateRecipient(id: string, field: keyof Omit<Recipient, "id" | "checked">, value: string) {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function handleToggle(id: string) {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }

  function handleToggleAll(checked: boolean) {
    setRecipients((prev) => prev.map((r) => ({ ...r, checked })));
  }

  function handleDelete(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  function handleImport() {
    const parsed = parseSpreadsheetText(pasteText);
    if (parsed.length === 0) { showToast("有効な宛先が見つかりませんでした"); return; }
    setRecipients((prev) => [...prev, ...parsed.map((p) => ({ ...p, id: uid(), checked: true }))]);
    setPasteText("");
    setImportOpen(false);
    showToast(`${parsed.length}件の宛先を追加しました`);
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split("\n").filter((l) => l.trim());
      const firstLine = lines[0]?.toLowerCase() || "";
      const hasHeader = firstLine.includes("企業") || firstLine.includes("会社") || firstLine.includes("メール") || firstLine.includes("email") || firstLine.includes("company");
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const parsed = parseSpreadsheetText(dataLines.join("\n"));
      if (parsed.length === 0) { showToast("有効な宛先が見つかりませんでした"); return; }
      setRecipients((prev) => [...prev, ...parsed.map((p) => ({ ...p, id: uid(), checked: true }))]);
      setImportOpen(false);
      showToast(`${parsed.length}件の宛先を追加しました`);
    };
    reader.readAsText(file);
  }

  async function handleSendAll() {
    if (!selectedTemplate || !selectedSenderId || checkedRecipients.length === 0 || isSending) return;
    const toSend = checkedRecipients.filter(
      (r) => r.email && rowStatus[r.id]?.state !== "sent"
    );
    if (toSend.length === 0) { showToast("送信対象がありません"); return; }

    const sender = senders.find((s) => s.id === selectedSenderId);
    const confirmMsg = testMode
      ? `テストモード: ${toSend.length}件分をテストアドレス宛に送信します。よろしいですか？`
      : `${toSend.length}件のメールを ${sender?.email ?? ""} から送信します。よろしいですか？`;
    if (!confirm(confirmMsg)) return;

    setIsSending(true);
    cancelRef.current = false;
    let okCount = 0;
    let failCount = 0;
    let stoppedAt = -1;

    for (const [index, r] of toSend.entries()) {
      if (cancelRef.current) {
        stoppedAt = index;
        break;
      }
      setRowStatus((prev) => ({ ...prev, [r.id]: { state: "sending" } }));
      const { subject, body } = buildEmail(r);
      try {
        const res = await fetch("/api/bulk-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: selectedSenderId,
            company: r.company,
            person: r.person,
            email: r.email,
            subject,
            body,
            attachmentIds: [...selectedAttachmentIds],
            acknowledgedWarnings: allowWarnings,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = Array.isArray(data.reasons)
            ? data.reasons.join(" / ")
            : Array.isArray(data.warnings)
              ? `要確認: ${data.warnings.join(" / ")}（送信していません）`
              : data.error || "送信に失敗しました";
          setRowStatus((prev) => ({ ...prev, [r.id]: { state: "failed", error: msg } }));
          failCount++;
        } else {
          setRowStatus((prev) => ({ ...prev, [r.id]: { state: "sent" } }));
          okCount++;
        }
      } catch {
        setRowStatus((prev) => ({ ...prev, [r.id]: { state: "failed", error: "通信エラーが発生しました" } }));
        failCount++;
      }
      await new Promise((res) => setTimeout(res, 300));
    }

    setIsSending(false);
    cancelRef.current = false;

    if (stoppedAt >= 0) {
      const remaining = toSend.length - stoppedAt;
      showToast(`中断しました（送信済 ${okCount}件 / 失敗 ${failCount}件 / 未送信 ${remaining}件）`);
      return;
    }
    showToast(
      failCount === 0
        ? `${okCount}件を送信しました`
        : `送信完了: 成功${okCount}件 / 失敗${failCount}件`
    );
  }

  function handleCancelSending() {
    cancelRef.current = true;
    showToast("現在の1件を送り終えたら停止します");
  }

  const sentProspects = useMemo(() => {
    const q = historySearch.toLowerCase();
    return sorted
      .filter((p) => p.send_status === "sent" && p.emails_found_json)
      .filter((p) =>
        !q ||
        (p.company_name || "").toLowerCase().includes(q) ||
        (p.domain || "").toLowerCase().includes(q) ||
        (p.emails_found_json || "").toLowerCase().includes(q)
      );
  }, [sorted, historySearch]);

  function handleHistoryImport() {
    const toAdd: Omit<Recipient, "id" | "checked">[] = [];
    const existingEmails = new Set(recipients.map((r) => r.email.toLowerCase()));

    for (const p of sentProspects) {
      if (!historyChecked.has(p.id)) continue;
      const emails: string[] = p.emails_found_json ? JSON.parse(p.emails_found_json) : [];
      for (const email of emails) {
        if (existingEmails.has(email.toLowerCase())) continue;
        toAdd.push({ company: p.company_name || p.domain, person: "", email });
        existingEmails.add(email.toLowerCase());
      }
    }

    if (toAdd.length === 0) {
      showToast("追加できる宛先がありません（既に追加済みの可能性があります）");
      return;
    }

    setRecipients((prev) => [...prev, ...toAdd.map((r) => ({ ...r, id: uid(), checked: true }))]);
    setHistoryOpen(false);
    setHistoryChecked(new Set());
    setHistorySearch("");
    showToast(`${toAdd.length}件の宛先を送信履歴から追加しました`);
  }

  const allChecked = recipients.length > 0 && recipients.every((r) => r.checked);
  const parsedPreview = parseSpreadsheetText(pasteText);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-xl font-bold tracking-tight">メール一括送信</h1>
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20">
      <div className="mb-1">
        <h1 className="text-xl font-bold tracking-tight">メール一括送信</h1>
        <p className="text-[13px] text-(--color-muted)">宛先リストを作成し、テンプレートメールを一括送信します</p>
      </div>

      {/* No sender warning */}
      {senders.length === 0 && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-(--color-warning-light) p-4 text-sm dark:border-amber-800">
          <Warning className="mt-0.5 shrink-0" size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
          <p className="text-gray-700 dark:text-gray-300">
            Gmailアカウントが未接続です。一括送信には
            <Link href="/settings" className="mx-1 font-medium text-(--color-primary) underline underline-offset-2">
              設定ページ
            </Link>
            からGmail接続が必要です。
          </p>
        </div>
      )}

      {/* テンプレートが1件も無いと何も送れないので導線を出す */}
      {templates.length === 0 && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-(--color-warning-light) p-4 text-sm dark:border-amber-800">
          <Warning className="mt-0.5 shrink-0" size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
          <div className="text-gray-700 dark:text-gray-300">
            一括送信にはテンプレートが必要です。
            <Link href="/templates" className="mx-1 font-medium text-(--color-primary) underline underline-offset-2">
              テンプレート
            </Link>
            で作成してください。企業名は
            <code className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-[12px] dark:bg-slate-700">{"{{company_name}}"}</code>
            、担当者名は
            <code className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-[12px] dark:bg-slate-700">{"{{person_name}}"}</code>
            と書くと宛先ごとに差し替わります。
          </div>
        </div>
      )}

      {/* Test mode badge */}
      {testMode && (
        <div className="mt-5 rounded-xl border border-(--color-border) bg-(--color-primary-light) px-4 py-3 text-[13px] font-medium text-(--color-primary)">
          テストモード中: すべてのメールはテストアドレス宛に送信されます
        </div>
      )}

      {/* Template / sender selector */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
            テンプレートメール
          </label>
          <div className="relative">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="">テンプレートを選択</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.subject.slice(0, 40)}
                </option>
              ))}
            </select>
            <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} weight="bold" />
          </div>
        </div>

        {senders.length > 0 && (
          <div className="min-w-[240px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
              送信元アカウント
            </label>
            <div className="relative">
              <select
                value={selectedSenderId ?? ""}
                onChange={(e) => setSelectedSenderId(Number(e.target.value))}
                className="h-10 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name ? `${s.display_name} (${s.email})` : s.email}
                    {s.auth_status !== "connected" ? " [要再認証]" : ""}
                  </option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} weight="bold" />
            </div>
          </div>
        )}
      </div>

      {/* Attachment picker */}
      {attachmentsLib.length > 0 && (
        <div className="mt-3">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
            添付資料（全宛先に添付されます）
          </label>
          <div className="flex flex-wrap gap-2">
            {attachmentsLib.map((a) => {
              const selected = selectedAttachmentIds.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    setSelectedAttachmentIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(a.id)) next.delete(a.id);
                      else next.add(a.id);
                      return next;
                    });
                  }}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                    selected
                      ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)"
                      : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"
                  }`}
                >
                  {selected ? <Check size={12} weight="bold" /> : <Paperclip size={12} />}
                  {a.filename}
                  <span className="opacity-60">{formatSize(a.size_bytes)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        {/* Left: Recipients */}
        <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5"/><circle cx="11.5" cy="5.5" r="2"/><path d="M14.5 14c0-2.2-1.2-3.5-3-3.8"/></svg>
              宛先リスト
              {recipients.length > 0 && (
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-(--color-primary-light) px-1.5 text-[11px] font-bold text-(--color-primary)">
                  {recipients.length}
                </span>
              )}
            </h2>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleToggleAll(true)}
                className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-3 text-xs font-medium transition-colors ${allChecked ? "border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)" : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"}`}
              >
                <Check size={12} weight="bold" />
                全選択
              </button>
              <button
                type="button"
                onClick={() => handleToggleAll(false)}
                className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-(--color-border) px-3 text-xs font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
              >
                全解除
              </button>
            </div>
          </div>

          {recipients.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-(--color-border) bg-gray-50 text-left dark:bg-slate-700/50">
                    <th className="w-[40px] px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => handleToggleAll(e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                      />
                    </th>
                    <th className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">#</th>
                    <th className="min-w-[160px] px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">企業名</th>
                    <th className="min-w-[120px] px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">担当者名</th>
                    <th className="min-w-[200px] px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">メールアドレス</th>
                    <th className="w-[44px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">状態</th>
                    <th className="w-[40px] px-2 py-2.5" />
                    <th className="w-[36px] px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r, i) => (
                    <Fragment key={r.id}>
                    <tr
                      className={`border-b border-(--color-border) last:border-0 transition-colors ${r.checked ? "bg-(--color-primary-light)/30" : "hover:bg-(--color-card-hover)"} ${rowStatus[r.id]?.state === "sent" ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 text-center">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={() => handleToggle(r.id)}
                          className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                        />
                      </td>
                      <td className="px-2 text-center text-xs tabular-nums text-(--color-muted)">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={r.company}
                          onChange={(e) => handleUpdateRecipient(r.id, "company", e.target.value)}
                          className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] transition-colors hover:border-(--color-border) hover:bg-(--color-card) focus:border-(--color-primary) focus:bg-(--color-card) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                          placeholder="株式会社○○"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={r.person}
                          onChange={(e) => handleUpdateRecipient(r.id, "person", e.target.value)}
                          className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] transition-colors hover:border-(--color-border) hover:bg-(--color-card) focus:border-(--color-primary) focus:bg-(--color-card) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                          placeholder="担当者名"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="email"
                          value={r.email}
                          onChange={(e) => handleUpdateRecipient(r.id, "email", e.target.value)}
                          className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] text-(--color-primary) transition-colors hover:border-(--color-border) hover:bg-(--color-card) focus:border-(--color-primary) focus:bg-(--color-card) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                          placeholder="email@example.com"
                        />
                      </td>
                      <td className="px-2 text-center">
                        {rowStatus[r.id]?.state === "sending" && (
                          <SpinnerGap size={15} className="inline-block animate-spin text-(--color-primary)" />
                        )}
                        {rowStatus[r.id]?.state === "sent" && (
                          <Check size={15} weight="bold" className="inline-block" style={{ color: "var(--color-success)" }} />
                        )}
                        {rowStatus[r.id]?.state === "failed" && (
                          <X size={15} weight="bold" className="inline-block" style={{ color: "var(--color-danger)" }} />
                        )}
                      </td>
                      <td className="px-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const idx = checkedPreviewList.findIndex((cr) => cr.id === r.id);
                            if (idx >= 0) setPreviewIndex(idx);
                          }}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-primary-light) hover:text-(--color-primary)"
                          title="プレビュー"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                      <td className="px-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                          title="削除"
                        >
                          <Trash size={14} />
                        </button>
                      </td>
                    </tr>
                    {rowStatus[r.id]?.state === "failed" && rowStatus[r.id]?.error && (
                      <tr className="border-b border-(--color-border) last:border-0 bg-(--color-danger-light)">
                        <td colSpan={8} className="px-4 py-2 text-[12px] text-(--color-danger)">
                          {rowStatus[r.id].error}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recipients.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <p className="text-sm text-(--color-muted)">宛先がまだありません</p>
            </div>
          )}

          <div className="flex border-t border-(--color-border)">
            <button
              type="button"
              onClick={handleAddOne}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-r border-(--color-border) py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
            >
              <Plus size={14} weight="bold" />
              1件追加
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-r border-(--color-border) py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
            >
              <UploadSimple size={14} weight="bold" />
              スプシ / CSV
            </button>
            <button
              type="button"
              onClick={() => { setHistoryOpen(true); setHistoryChecked(new Set()); setHistorySearch(""); }}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
            >
              <ClockCounterClockwise size={14} weight="bold" />
              送信履歴から追加
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="sticky top-6 h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          <div className="flex items-center justify-between border-b border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Eye size={15} />
              送信プレビュー
            </h2>
            {previewRecipient && (
              <span className="inline-flex items-center gap-1 rounded-md bg-(--color-success-light) px-2 py-0.5 text-[10px] font-semibold text-(--color-success)">
                <Check size={10} weight="bold" />
                選択中
              </span>
            )}
          </div>

          {previewRecipient && selectedTemplate ? (
            <>
              <div className="space-y-3.5 p-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">宛先</p>
                  <p className="mt-0.5 text-[13px]">{previewRecipient.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</p>
                  <p className="mt-0.5 text-sm font-semibold">{buildEmail(previewRecipient).subject}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文</p>
                  <div className="mt-1 max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--color-border) bg-gray-50 p-3.5 text-[12.5px] leading-[1.9] dark:bg-slate-800">
                    {buildEmail(previewRecipient).body}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-2.5 dark:bg-slate-700/50">
                <span className="text-[11px] tabular-nums text-(--color-muted)">
                  {clampedPreviewIndex + 1} / {checkedPreviewList.length} 件目
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                    disabled={clampedPreviewIndex === 0}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretLeft size={12} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.min(checkedPreviewList.length - 1, i + 1))}
                    disabled={clampedPreviewIndex >= checkedPreviewList.length - 1}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--color-border) bg-(--color-card) text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CaretRight size={12} weight="bold" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <p className="text-sm text-(--color-muted)">
                {!selectedTemplate ? "テンプレートを選択してください" : "チェックした宛先のプレビューが表示されます"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer action bar */}
      {recipients.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-[13px] text-(--color-muted)">
              <span className="text-lg font-bold text-(--color-foreground)">{checkedRecipients.length}</span> / {recipients.length} 件選択中
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-(--color-muted)">
              <input
                type="checkbox"
                checked={allowWarnings}
                onChange={(e) => setAllowWarnings(e.target.checked)}
                disabled={isSending}
                className="h-4 w-4 cursor-pointer accent-(--color-primary)"
              />
              要確認の指摘があっても送信する
            </label>
          </div>
          <div className="flex items-center gap-2">
            {isSending && (
              <button
                type="button"
                onClick={handleCancelSending}
                className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-danger)/40 px-4 text-sm font-semibold text-(--color-danger) transition-colors hover:bg-(--color-danger-light)"
              >
                <X size={15} weight="bold" />
                中断
              </button>
            )}
            <button
              type="button"
              onClick={handleSendAll}
              disabled={!selectedTemplate || !selectedSenderId || checkedRecipients.length === 0 || isSending}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <PaperPlaneTilt size={16} weight="fill" />
              )}
              {isSending ? "送信中..." : `選択した${checkedRecipients.length}件を送信`}
            </button>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setHistoryOpen(false); }}
        >
          <div className="flex w-full max-w-[640px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <h3 className="text-[15px] font-semibold">送信履歴から宛先を追加</h3>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pt-4 pb-3">
              <div className="relative">
                <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="企業名・ドメイン・メールアドレスで検索"
                  className="h-9 w-full rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3">
              {sentProspects.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-sm text-(--color-muted)">
                    {historySearch ? "該当する送信履歴がありません" : "送信済みの宛先がありません"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sentProspects.map((p) => {
                    const emails: string[] = p.emails_found_json ? JSON.parse(p.emails_found_json) : [];
                    const checked = historyChecked.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${checked ? "border-(--color-primary) bg-(--color-primary-light)/40" : "border-(--color-border) hover:border-(--color-primary)/50 hover:bg-(--color-card-hover)"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setHistoryChecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{p.company_name || p.domain}</p>
                          <p className="truncate text-[12px] text-(--color-muted)">{emails.join(", ")}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-(--color-muted)">
                          {new Date(p.created_at).toLocaleDateString("ja-JP")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
              <span className="text-xs text-(--color-muted)">
                {historyChecked.size > 0 && (
                  <>選択中: <strong className="font-semibold text-(--color-foreground)">{historyChecked.size}</strong> 件</>
                )}
              </span>
              <button
                type="button"
                onClick={handleHistoryImport}
                disabled={historyChecked.size === 0}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={14} weight="bold" />
                宛先に追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}
        >
          <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <h3 className="text-[15px] font-semibold">宛先を一括追加</h3>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 flex overflow-hidden rounded-lg border border-(--color-border)">
                <button
                  type="button"
                  onClick={() => setImportTab("paste")}
                  className={`flex-1 cursor-pointer border-r border-(--color-border) py-2.5 text-center text-[13px] font-medium transition-colors ${importTab === "paste" ? "bg-(--color-primary-light) font-semibold text-(--color-primary)" : "text-(--color-muted) hover:bg-(--color-card-hover)"}`}
                >
                  スプシからコピペ
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab("csv")}
                  className={`flex-1 cursor-pointer py-2.5 text-center text-[13px] font-medium transition-colors ${importTab === "csv" ? "bg-(--color-primary-light) font-semibold text-(--color-primary)" : "text-(--color-muted) hover:bg-(--color-card-hover)"}`}
                >
                  CSVファイル
                </button>
              </div>

              {importTab === "paste" ? (
                <>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={7}
                    className="w-full rounded-lg border border-(--color-border) bg-gray-50 p-3 font-mono text-[13px] leading-[1.7] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                    placeholder={"スプレッドシートからコピーして貼り付け\n\n株式会社メルカリ\t田中 太郎\ttanaka@mercari.com\nfreee株式会社\t佐藤 花子\tsato@freee.co.jp"}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-(--color-muted)">
                    スプレッドシートから <code className="rounded border border-(--color-border) bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">企業名</code>{" "}
                    <code className="rounded border border-(--color-border) bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">担当者名</code>{" "}
                    <code className="rounded border border-(--color-border) bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">メールアドレス</code>{" "}
                    の3列を選択してコピー → ここに貼り付けてください。
                  </p>
                </>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-(--color-border) px-6 py-10 transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-light)"
                  >
                    <FileArrowUp size={32} className="text-(--color-muted)" />
                    <p className="text-[13px] text-(--color-muted)">クリックまたはドラッグ&ドロップでCSVをアップロード</p>
                    <p className="text-[11px] text-(--color-muted)">.csv 対応</p>
                  </button>
                  <p className="mt-2 text-[11px] leading-relaxed text-(--color-muted)">
                    1行目がヘッダーの場合は自動でスキップします。
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
              <span className="text-xs text-(--color-muted)">
                {importTab === "paste" && parsedPreview.length > 0 && (
                  <>検出: <strong className="font-semibold text-(--color-foreground)">{parsedPreview.length}</strong> 件の宛先</>
                )}
              </span>
              {importTab === "paste" && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={parsedPreview.length === 0}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check size={14} weight="bold" />
                  {parsedPreview.length}件を追加
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
