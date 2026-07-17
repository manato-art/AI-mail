"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddressBook,
  CaretDown,
  Check,
  Eye,
  MagnifyingGlass,
  Plus,
  SpinnerGap,
  Trash,
  UploadSimple,
  X,
  PaperPlaneTilt,
  CaretLeft,
  CaretRight,
  FileArrowUp,
  Key,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { Prospect } from "@/lib/types";

interface EightContact {
  id: string;
  company_name: string;
  person_name: string;
  email: string;
  department: string;
  position: string;
}

interface Recipient {
  id: string;
  company: string;
  person: string;
  email: string;
  checked: boolean;
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
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [eightOpen, setEightOpen] = useState(false);
  const [eightApiKey, setEightApiKey] = useState("");
  const [eightHasKey, setEightHasKey] = useState(false);
  const [eightQuery, setEightQuery] = useState("");
  const [eightContacts, setEightContacts] = useState<EightContact[]>([]);
  const [eightChecked, setEightChecked] = useState<Set<string>>(new Set());
  const [eightLoading, setEightLoading] = useState(false);
  const [eightSavingKey, setEightSavingKey] = useState(false);
  const [eightSearched, setEightSearched] = useState(false);

  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/prospects"),
          fetch("/api/settings"),
        ]);
        const pData: Prospect[] = pRes.ok ? await pRes.json() : [];
        const sData = sRes.ok ? await sRes.json() : {};
        if (!cancelled) {
          setProspects(pData);
          if (sData.sender_email) setSenderEmail(sData.sender_email);
          if (sData.eight_api_key) setEightHasKey(true);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(
    () => [...prospects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [prospects]
  );

  const selectedProspect = useMemo(
    () => (selectedProspectId ? prospects.find((p) => p.id === Number(selectedProspectId)) : undefined),
    [prospects, selectedProspectId]
  );

  const checkedRecipients = useMemo(() => recipients.filter((r) => r.checked), [recipients]);
  const checkedPreviewList = checkedRecipients;

  const clampedPreviewIndex = Math.min(previewIndex, Math.max(0, checkedPreviewList.length - 1));
  const previewRecipient = checkedPreviewList[clampedPreviewIndex];

  const buildEmail = useCallback(
    (r: Recipient) => {
      if (!selectedProspect) return { subject: "", body: "" };
      const origCompany = selectedProspect.company_name || "";
      let subj = selectedProspect.subject;
      let bod = selectedProspect.body;
      if (origCompany) {
        subj = subj.replaceAll(origCompany, r.company);
        bod = bod.replaceAll(origCompany, r.company);
      }
      bod = bod.replace(/ご担当者/, r.person ? `${r.person}` : "ご担当者");
      return { subject: subj, body: bod };
    },
    [selectedProspect]
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
    if (!selectedProspect || checkedRecipients.length === 0) return;
    const toSend = checkedRecipients.filter((r) => r.email && !sentIds.has(r.id));
    if (toSend.length === 0) { showToast("送信対象がありません"); return; }

    const newSending = new Set(sendingIds);
    toSend.forEach((r) => newSending.add(r.id));
    setSendingIds(newSending);

    for (const r of toSend) {
      const { subject, body } = buildEmail(r);
      const gmailUrl = `https://mail.google.com/mail/?${senderEmail ? `authuser=${encodeURIComponent(senderEmail)}&` : ""}view=cm&to=${encodeURIComponent(r.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
      await new Promise((res) => setTimeout(res, 500));
    }

    setSendingIds(new Set());
    setSentIds((prev) => {
      const next = new Set(prev);
      toSend.forEach((r) => next.add(r.id));
      return next;
    });
    showToast(`${toSend.length}件のGmail作成画面を開きました`);
  }

  async function handleEightSaveKey() {
    if (!eightApiKey.trim()) return;
    setEightSavingKey(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eight_api_key: eightApiKey.trim() }),
      });
      if (res.ok) {
        setEightHasKey(true);
        showToast("Eight APIキーを保存しました");
      }
    } catch {
      showToast("APIキーの保存に失敗しました");
    } finally {
      setEightSavingKey(false);
    }
  }

  async function handleEightSearch() {
    setEightLoading(true);
    setEightSearched(true);
    try {
      const res = await fetch(`/api/eight/contacts?q=${encodeURIComponent(eightQuery)}`);
      const data = await res.json();
      if (res.ok) {
        setEightContacts(data.contacts ?? []);
        setEightChecked(new Set());
      } else {
        showToast(data.error ?? "名刺の取得に失敗しました");
      }
    } catch {
      showToast("Eight APIとの通信に失敗しました");
    } finally {
      setEightLoading(false);
    }
  }

  function handleEightToggle(id: string) {
    setEightChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleEightToggleAll() {
    if (eightChecked.size === eightContacts.length) {
      setEightChecked(new Set());
    } else {
      setEightChecked(new Set(eightContacts.map((c) => c.id)));
    }
  }

  function handleEightImport() {
    const selected = eightContacts.filter((c) => eightChecked.has(c.id));
    if (selected.length === 0) { showToast("名刺を選択してください"); return; }
    const newRecipients = selected.map((c) => ({
      id: uid(),
      company: c.company_name,
      person: c.person_name,
      email: c.email,
      checked: true,
    }));
    setRecipients((prev) => [...prev, ...newRecipients]);
    setEightOpen(false);
    setEightContacts([]);
    setEightChecked(new Set());
    setEightQuery("");
    setEightSearched(false);
    showToast(`${selected.length}件の名刺を追加しました`);
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

      {/* Template selector */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
            テンプレートメール
          </label>
          <div className="relative">
            <select
              value={selectedProspectId}
              onChange={(e) => setSelectedProspectId(e.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="">テンプレートを選択</option>
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company_name || p.domain} — {p.subject.slice(0, 40)}
                </option>
              ))}
            </select>
            <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} weight="bold" />
          </div>
        </div>
      </div>

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
                    <th className="w-[40px] px-2 py-2.5" />
                    <th className="w-[36px] px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-(--color-border) last:border-0 transition-colors ${r.checked ? "bg-(--color-primary-light)/30" : "hover:bg-(--color-card-hover)"} ${sentIds.has(r.id) ? "opacity-50" : ""}`}
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
              onClick={() => setEightOpen(true)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
            >
              <AddressBook size={14} weight="bold" />
              Eightから取り込み
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

          {previewRecipient && selectedProspect ? (
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
                {!selectedProspect ? "テンプレートを選択してください" : "チェックした宛先のプレビューが表示されます"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer action bar */}
      {recipients.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-(--color-muted)">
            <span className="text-lg font-bold text-(--color-foreground)">{checkedRecipients.length}</span> / {recipients.length} 件選択中
          </p>
          <button
            type="button"
            onClick={handleSendAll}
            disabled={!selectedProspect || checkedRecipients.length === 0 || sendingIds.size > 0}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sendingIds.size > 0 ? (
              <SpinnerGap size={16} className="animate-spin" />
            ) : (
              <PaperPlaneTilt size={16} weight="fill" />
            )}
            {sendingIds.size > 0 ? "送信中..." : `選択した${checkedRecipients.length}件を送信`}
          </button>
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

      {/* Eight Import Modal */}
      {eightOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setEightOpen(false); }}
        >
          <div className="flex w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl" style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                <AddressBook size={18} />
                Eightから名刺を取り込み
              </h3>
              <button
                type="button"
                onClick={() => setEightOpen(false)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-danger-light) hover:text-(--color-danger)"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {!eightHasKey ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-200 bg-(--color-warning-light) p-4 dark:border-amber-800">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Eight APIキーが未設定です</p>
                    <p className="mt-1 text-xs text-(--color-muted)">
                      Eightの名刺データを取得するにはAPIキーが必要です。
                      <Link href="/settings" className="text-(--color-primary) font-medium underline underline-offset-2 ml-1" onClick={() => setEightOpen(false)}>
                        設定ページ
                      </Link>
                      からも設定できます。
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">APIキー</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted) pointer-events-none" />
                        <input
                          type="password"
                          value={eightApiKey}
                          onChange={(e) => setEightApiKey(e.target.value)}
                          placeholder="Eight APIキーを入力"
                          className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleEightSaveKey}
                        disabled={!eightApiKey.trim() || eightSavingKey}
                        className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {eightSavingKey ? <SpinnerGap size={14} className="animate-spin" /> : <Check size={14} weight="bold" />}
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted) pointer-events-none" />
                      <input
                        type="text"
                        value={eightQuery}
                        onChange={(e) => setEightQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleEightSearch(); }}
                        placeholder="企業名・氏名で検索"
                        className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleEightSearch}
                      disabled={eightLoading}
                      className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {eightLoading ? <SpinnerGap size={14} className="animate-spin" /> : <MagnifyingGlass size={14} weight="bold" />}
                      検索
                    </button>
                  </div>

                  {eightLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
                    </div>
                  ) : eightContacts.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-(--color-border)">
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="border-b border-(--color-border) bg-gray-50 text-left dark:bg-slate-700/50">
                            <th className="w-[40px] px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={eightChecked.size === eightContacts.length && eightContacts.length > 0}
                                onChange={handleEightToggleAll}
                                className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                              />
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">企業名</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">氏名</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">役職</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">メール</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eightContacts.map((c) => (
                            <tr
                              key={c.id}
                              className={`border-b border-(--color-border) last:border-0 transition-colors cursor-pointer ${eightChecked.has(c.id) ? "bg-(--color-primary-light)/30" : "hover:bg-(--color-card-hover)"}`}
                              onClick={() => handleEightToggle(c.id)}
                            >
                              <td className="px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={eightChecked.has(c.id)}
                                  onChange={() => handleEightToggle(c.id)}
                                  className="h-4 w-4 cursor-pointer accent-(--color-primary)"
                                />
                              </td>
                              <td className="px-3 py-2.5 font-medium">{c.company_name}</td>
                              <td className="px-3 py-2.5">{c.person_name}</td>
                              <td className="px-3 py-2.5 text-(--color-muted)">{c.position || c.department || "-"}</td>
                              <td className="px-3 py-2.5 text-(--color-primary)">{c.email || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : eightSearched ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <AddressBook size={28} className="text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-(--color-muted)">名刺が見つかりませんでした</p>
                      <p className="text-xs text-(--color-muted)">Eight API未接続のため、APIキー受領後に取得可能になります</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <MagnifyingGlass size={28} className="text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-(--color-muted)">検索して名刺を取り込みましょう</p>
                      <p className="text-xs text-(--color-muted)">空欄で検索すると全件取得します</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {eightHasKey && eightContacts.length > 0 && (
              <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
                <span className="text-xs text-(--color-muted)">
                  <strong className="font-semibold text-(--color-foreground)">{eightChecked.size}</strong> / {eightContacts.length} 件選択
                </span>
                <button
                  type="button"
                  onClick={handleEightImport}
                  disabled={eightChecked.size === 0}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check size={14} weight="bold" />
                  {eightChecked.size}件を追加
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
