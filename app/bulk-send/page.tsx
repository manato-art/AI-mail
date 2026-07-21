"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Buildings,
  CaretDown,
  Check,
  ClockCounterClockwise,
  EnvelopeOpen,
  Eye,
  MagicWand,
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
  PencilSimple,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import type { Attachment, Company, Contact, Prospect, TemplateWithAttachments } from "@/lib/types";
import { Toast } from "@/components/toast";
import { resolveEmailVariables } from "@/lib/variables";
import type { ColumnKind } from "@/lib/import-parse";

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
  warning?: string;
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

  const [inputMode, setInputMode] = useState<"template" | "direct">("template");
  const [directSubject, setDirectSubject] = useState("");
  const [directBody, setDirectBody] = useState("");
  const directBodyRef = useRef<HTMLTextAreaElement>(null);

  const [generatedOpen, setGeneratedOpen] = useState(false);
  const [generatedSearch, setGeneratedSearch] = useState("");

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsHydrated, setRecipientsHydrated] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnKinds, setColumnKinds] = useState<ColumnKind[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [isSending, setIsSending] = useState(false);
  const [allowWarnings, setAllowWarnings] = useState(false);
  /** 送信ループの中断フラグ。現在の1件を送り終えてから止まる */
  const cancelRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyChecked, setHistoryChecked] = useState<Set<number>>(new Set());

  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [companiesSearch, setCompaniesSearch] = useState("");
  const [companiesChecked, setCompaniesChecked] = useState<Set<number>>(new Set());
  const [companiesLoading, setCompaniesLoading] = useState(false);

  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [generatedEmails, setGeneratedEmails] = useState<Record<string, { subject: string; body: string }>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });
  const cancelGenerateRef = useRef(false);

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  function insertAtCursorDirect(text: string, cursorBack = 0) {
    const el = directBodyRef.current;
    if (!el) { setDirectBody((prev) => prev + text); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = directBody.slice(0, start);
    const after = directBody.slice(end);
    setDirectBody(before + text + after);
    requestAnimationFrame(() => {
      const pos = start + text.length - cursorBack;
      el.selectionStart = pos;
      el.selectionEnd = pos;
      el.focus();
    });
  }

  function handlePickGenerated(p: Prospect) {
    setDirectSubject(p.generated_subject);
    setDirectBody(p.generated_body);
    setGeneratedOpen(false);
    setGeneratedSearch("");
    if (inputMode !== "direct") setInputMode("direct");
    showToast("生成済みメールを読み込みました");
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
      const saved = sessionStorage.getItem("bulk-send-recipients");
      if (saved) {
        const parsed: Recipient[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setRecipients(parsed);
        }
      }

      const raw = sessionStorage.getItem("bulk-send-import");
      if (raw) {
        sessionStorage.removeItem("bulk-send-import");
        const imported: { company: string; person: string; email: string }[] = JSON.parse(raw);
        if (Array.isArray(imported) && imported.length > 0) {
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
        }
      }
    } catch { /* ignore */ }
    setRecipientsHydrated(true);
  }, []);

  useEffect(() => {
    if (!recipientsHydrated) return;
    try {
      if (recipients.length > 0) {
        sessionStorage.setItem("bulk-send-recipients", JSON.stringify(recipients));
      } else {
        sessionStorage.removeItem("bulk-send-recipients");
      }
    } catch { /* quota exceeded — ignore */ }
  }, [recipients, recipientsHydrated]);

  useEffect(() => {
    if (!isSending && recipients.length === 0) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSending, recipients.length]);

  const sorted = useMemo(
    () => [...prospects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [prospects]
  );

  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? templates.find((t) => t.id === Number(selectedTemplateId)) : undefined),
    [templates, selectedTemplateId]
  );

  /**
   * F22: テンプレを変えたら選択済みの添付を落とす。
   * 添付不可のテンプレに残したままだとサーバ側の422で全件失敗する。
   */
  function handleTemplateChange(nextId: string) {
    setSelectedTemplateId(nextId);
    setSelectedAttachmentIds(new Set());
  }

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
      const srcSubject = inputMode === "direct" ? directSubject : selectedTemplate?.subject ?? "";
      const srcBody = inputMode === "direct" ? directBody : selectedTemplate?.body ?? "";
      if (!srcSubject.trim() && !srcBody.trim()) return { subject: "", body: "", unresolved: [] as string[] };
      const resolved = resolveEmailVariables(srcSubject, srcBody, {
        company_name: r.company,
        person_name: r.person,
      });
      return { subject: resolved.subject, body: resolved.body, unresolved: resolved.unresolved };
    },
    [selectedTemplate, inputMode, directSubject, directBody]
  );

  const hasContent = inputMode === "template" ? !!selectedTemplate : !!(directSubject.trim() || directBody.trim());

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


  async function handleSendAll() {
    const canSend = inputMode === "template"
      ? !!selectedTemplate && !!selectedSenderId
      : !!(directSubject.trim() && directBody.trim() && selectedSenderId);
    if (!canSend || checkedRecipients.length === 0 || isSending) return;
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
      const generated = generatedEmails[r.id];
      const { subject, body: emailBody } = generated ?? buildEmail(r);
      try {
        const res = await fetch("/api/bulk-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: selectedSenderId,
            templateId: inputMode === "template" ? selectedTemplate?.id : undefined,
            company: r.company,
            person: r.person,
            email: r.email,
            subject,
            body: emailBody,
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
          const warning = Array.isArray(data.warnings) ? data.warnings.join(" / ") : undefined;
          setRowStatus((prev) => ({ ...prev, [r.id]: { state: "sent", warning } }));
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

  async function handleGenerateAll() {
    const canGenerate = inputMode === "template"
      ? !!selectedTemplate && !!selectedSenderId
      : !!(directSubject.trim() && directBody.trim() && selectedSenderId);
    if (!canGenerate || checkedRecipients.length === 0 || isGenerating) return;
    const toGenerate = checkedRecipients.filter((r) => r.email);
    if (toGenerate.length === 0) { showToast("生成対象がありません"); return; }

    setIsGenerating(true);
    cancelGenerateRef.current = false;
    setGenerateProgress({ done: 0, total: toGenerate.length });
    let okCount = 0;
    let failCount = 0;

    const rawSubject = inputMode === "direct" ? directSubject : selectedTemplate?.subject ?? "";
    const rawBody = inputMode === "direct" ? directBody : selectedTemplate?.body ?? "";

    for (const [index, r] of toGenerate.entries()) {
      if (cancelGenerateRef.current) break;
      setGenerateProgress({ done: index, total: toGenerate.length });
      try {
        const res = await fetch("/api/bulk-send/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: selectedSenderId,
            templateId: inputMode === "template" ? selectedTemplate?.id : undefined,
            company: r.company,
            person: r.person,
            email: r.email,
            subject: rawSubject,
            body: rawBody,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setGeneratedEmails((prev) => ({
            ...prev,
            [r.id]: { subject: data.subject, body: data.body },
          }));
          okCount++;
        } else {
          setRowStatus((prev) => ({ ...prev, [r.id]: { state: "failed", error: data.error || "生成に失敗しました" } }));
          failCount++;
        }
      } catch {
        setRowStatus((prev) => ({ ...prev, [r.id]: { state: "failed", error: "通信エラーが発生しました" } }));
        failCount++;
      }
    }

    setGenerateProgress({ done: toGenerate.length, total: toGenerate.length });
    setIsGenerating(false);
    cancelGenerateRef.current = false;
    setPreviewIndex(0);

    if (failCount === 0) {
      showToast(`${okCount}件のメールを生成しました`);
    } else {
      showToast(`生成完了: 成功${okCount}件 / 失敗${failCount}件`);
    }
  }

  function handleCancelGenerating() {
    cancelGenerateRef.current = true;
    showToast("生成を中断します");
  }

  function handleUpdateGenerated(id: string, field: "subject" | "body", value: string) {
    setGeneratedEmails((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, [field]: value } };
    });
  }

  function handleClearGenerated() {
    setGeneratedEmails({});
    setRowStatus({});
    showToast("生成結果をクリアしました");
  }

  const hasGenerated = Object.keys(generatedEmails).length > 0;

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

  const generatedProspects = useMemo(() => {
    const q = generatedSearch.toLowerCase();
    return sorted
      .filter((p) => p.generated_subject && p.generated_body && p.input_url)
      .filter((p) =>
        !q ||
        (p.company_name || "").toLowerCase().includes(q) ||
        (p.generated_subject || "").toLowerCase().includes(q)
      );
  }, [sorted, generatedSearch]);

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

  async function openCompaniesModal() {
    setCompaniesOpen(true);
    setCompaniesChecked(new Set());
    setCompaniesSearch("");
    if (companiesList.length > 0) return;
    setCompaniesLoading(true);
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompaniesList(data.companies);
        setContactsList(data.contacts);
      }
    } catch { /* modal shows empty state */ }
    finally { setCompaniesLoading(false); }
  }

  const contactsByCompanyId = useMemo(() => {
    const map = new Map<number, Contact[]>();
    for (const c of contactsList) {
      if (c.company_id == null) continue;
      const list = map.get(c.company_id) ?? [];
      list.push(c);
      map.set(c.company_id, list);
    }
    return map;
  }, [contactsList]);

  const filteredCompanies = useMemo(() => {
    const withEmail = companiesList.filter(
      (c) => c.enrichment_status === "done" && (contactsByCompanyId.get(c.id)?.length ?? 0) > 0,
    );
    if (!companiesSearch) return withEmail;
    const q = companiesSearch.toLowerCase();
    return withEmail.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.domain ?? "").toLowerCase().includes(q) ||
        (contactsByCompanyId.get(c.id) ?? []).some((ct) => ct.email.toLowerCase().includes(q)),
    );
  }, [companiesList, companiesSearch, contactsByCompanyId]);

  function handleCompaniesImport() {
    const toAdd: Omit<Recipient, "id" | "checked">[] = [];
    const existingEmails = new Set(recipients.map((r) => r.email.toLowerCase()));

    for (const company of filteredCompanies) {
      if (!companiesChecked.has(company.id)) continue;
      const contacts = contactsByCompanyId.get(company.id) ?? [];
      for (const contact of contacts) {
        if (existingEmails.has(contact.email.toLowerCase())) continue;
        toAdd.push({ company: company.name, person: contact.person_name, email: contact.email });
        existingEmails.add(contact.email.toLowerCase());
      }
    }

    if (toAdd.length === 0) {
      showToast("追加できる宛先がありません（既に追加済みの可能性があります）");
      return;
    }

    setRecipients((prev) => [...prev, ...toAdd.map((r) => ({ ...r, id: uid(), checked: true }))]);
    setCompaniesOpen(false);
    setCompaniesChecked(new Set());
    setCompaniesSearch("");
    showToast(`${toAdd.length}件の宛先を企業一覧から追加しました`);
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
        <p className="text-[13px] text-(--color-muted)">宛先リストを作成し、メールを一括送信します</p>
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

      {/* テンプレートが1件も無い場合の導線（テンプレートモード時のみ） */}
      {inputMode === "template" && templates.length === 0 && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-(--color-warning-light) p-4 text-sm dark:border-amber-800">
          <Warning className="mt-0.5 shrink-0" size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
          <div className="text-gray-700 dark:text-gray-300">
            一括送信にはテンプレートが必要です。
            <Link href="/settings/templates" className="mx-1 font-medium text-(--color-primary) underline underline-offset-2">
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

      {/* Input mode selector */}
      <div className="mt-5 flex overflow-hidden rounded-lg border border-(--color-border)">
        <button
          type="button"
          onClick={() => setInputMode("template")}
          className={`flex-1 cursor-pointer py-2.5 text-center text-[13px] font-medium transition-colors ${
            inputMode === "template" ? "bg-(--color-primary-light) font-semibold text-(--color-primary)" : "text-(--color-muted) hover:bg-(--color-card-hover)"
          }`}
        >
          テンプレートから送信
        </button>
        <button
          type="button"
          onClick={() => setInputMode("direct")}
          className={`flex-1 cursor-pointer border-l border-(--color-border) py-2.5 text-center text-[13px] font-medium transition-colors ${
            inputMode === "direct" ? "bg-(--color-primary-light) font-semibold text-(--color-primary)" : "text-(--color-muted) hover:bg-(--color-card-hover)"
          }`}
        >
          直接入力して送信
        </button>
      </div>

      {/* Template / sender / direct input */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        {inputMode === "template" && (
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
              テンプレートメール
            </label>
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
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
        )}

        {senders.length > 0 && (
          <div className={inputMode === "direct" ? "min-w-[280px] flex-1" : "min-w-[240px]"}>
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

      {/* Direct input: placeholder — editing moved to the preview panel */}

      {/* F22: 添付が許可されていないテンプレでは、添付欄そのものを出さない */}
      {inputMode === "template" && selectedTemplate && !selectedTemplate.allow_attachments && attachmentsLib.length > 0 && (
        <p className="mt-3 text-[12px] text-(--color-muted)">
          このテンプレートでは資料を添付できません（初回メールへの添付は既定で禁止）。
          添付したい場合は
          <Link href="/settings/templates" className="mx-1 font-medium text-(--color-primary) underline underline-offset-2">
            テンプレート
          </Link>
          で「資料の添付を許可」をONにしてください。
        </p>
      )}

      {/* Attachment picker */}
      {((inputMode === "template" && selectedTemplate?.allow_attachments) || inputMode === "direct") && attachmentsLib.length > 0 && (
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
                      className={`relative border-b border-(--color-border) last:border-0 transition-colors ${r.checked ? "bg-(--color-primary-light)/30" : "hover:bg-(--color-card-hover)"} ${rowStatus[r.id]?.state === "sent" ? "opacity-50" : ""}`}
                      onMouseEnter={() => {
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                        hoverTimerRef.current = setTimeout(() => setHoveredRowId(r.id), 300);
                      }}
                      onMouseLeave={() => {
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                        hoverTimerRef.current = null;
                        setHoveredRowId(null);
                      }}
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
                    {hoveredRowId === r.id && hasContent && (() => {
                      const preview = buildEmail(r);
                      return preview.subject || preview.body ? (
                        <tr className="border-b border-(--color-border)">
                          <td colSpan={8} className="bg-gray-50/80 px-4 py-3 dark:bg-slate-800/60">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">送信プレビュー</p>
                            <p className="mt-1.5 text-[12px] font-semibold">{preview.subject}</p>
                            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-[1.7] text-(--color-muted)">
                              {preview.body}
                            </p>
                            {preview.unresolved.length > 0 && (
                              <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                                未解決: {preview.unresolved.join(", ")}
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : null;
                    })()}
                    {rowStatus[r.id]?.state === "failed" && rowStatus[r.id]?.error && (
                      <tr className="border-b border-(--color-border) last:border-0 bg-(--color-danger-light)">
                        <td colSpan={8} className="px-4 py-2 text-[12px] text-(--color-danger)">
                          {rowStatus[r.id].error}
                        </td>
                      </tr>
                    )}
                    {rowStatus[r.id]?.state === "sent" && rowStatus[r.id]?.warning && (
                      <tr className="border-b border-(--color-border) last:border-0">
                        <td colSpan={8} className="px-4 py-2 text-[12px] text-amber-600 dark:text-amber-400">
                          {rowStatus[r.id].warning}
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
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-r border-(--color-border) py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
            >
              <ClockCounterClockwise size={14} weight="bold" />
              送信履歴から追加
            </button>
            <button
              type="button"
              onClick={openCompaniesModal}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
            >
              <Buildings size={14} weight="bold" />
              企業一覧から追加
            </button>
          </div>
        </div>

        {/* Right: Generated editor / Input / Preview */}
        <div className="sticky top-6 h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)">
          {hasGenerated ? (
            <>
              <div className="flex items-center justify-between border-b border-(--color-border) bg-gray-50 px-5 py-3 dark:bg-slate-700/50">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <PencilSimple size={15} />
                  生成結果を編集
                </h2>
                <button
                  type="button"
                  onClick={handleClearGenerated}
                  disabled={isSending}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-(--color-border) px-2 text-[11px] font-medium text-(--color-muted) transition-colors hover:border-(--color-danger) hover:text-(--color-danger) disabled:opacity-40"
                >
                  <ArrowsClockwise size={12} />
                  やり直し
                </button>
              </div>
              {previewRecipient && generatedEmails[previewRecipient.id] ? (
                <>
                  <div className="space-y-2.5 p-4">
                    <div className="flex items-center gap-2 rounded-lg bg-(--color-primary-light)/40 px-3 py-1.5">
                      <Buildings size={13} className="shrink-0 text-(--color-primary)" />
                      <span className="truncate text-[12px] font-medium">{previewRecipient.company || previewRecipient.email}</span>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</label>
                      <input
                        type="text"
                        value={generatedEmails[previewRecipient.id].subject}
                        onChange={(e) => handleUpdateGenerated(previewRecipient.id, "subject", e.target.value)}
                        disabled={isSending}
                        className="h-9 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文</label>
                      <textarea
                        value={generatedEmails[previewRecipient.id].body}
                        onChange={(e) => handleUpdateGenerated(previewRecipient.id, "body", e.target.value)}
                        disabled={isSending}
                        rows={14}
                        className="w-full rounded-lg border border-(--color-border) bg-(--color-card) p-3 font-mono text-[12px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
                      />
                    </div>
                  </div>
                  {(() => {
                    const gen = generatedEmails[previewRecipient.id];
                    const resolved = resolveEmailVariables(gen.subject, gen.body, {
                      company_name: previewRecipient.company,
                      person_name: previewRecipient.person,
                    });
                    return (
                      <div className="border-t border-(--color-border) bg-gray-50 dark:bg-slate-800/50">
                        <div className="px-4 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">
                            差し込みプレビュー
                          </p>
                        </div>
                        <div className="max-h-[180px] overflow-y-auto px-4 pb-3">
                          <p className="text-[11px] font-semibold">{resolved.subject}</p>
                          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-[1.7] text-(--color-muted)">
                            {resolved.body}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
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
                    {previewRecipient ? "この宛先は未生成です" : "チェックした宛先を選択してください"}
                  </p>
                </div>
              )}
            </>
          ) : inputMode === "direct" ? (
            <>
              <div className="flex items-center justify-between border-b border-(--color-border) bg-gray-50 px-5 py-3 dark:bg-slate-700/50">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MagicWand size={15} />
                  メール作成
                </h2>
                {prospects.some((p) => p.generated_subject && p.generated_body && p.input_url) && (
                  <button
                    type="button"
                    onClick={() => { setGeneratedOpen(true); setGeneratedSearch(""); }}
                    className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-(--color-border) px-2 text-[11px] font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
                  >
                    <EnvelopeOpen size={12} />
                    引用
                  </button>
                )}
              </div>
              <div className="space-y-2.5 p-4">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</label>
                  <input
                    type="text"
                    value={directSubject}
                    onChange={(e) => setDirectSubject(e.target.value)}
                    className="h-9 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                    placeholder="{{company_name}}様へのご提案"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文</label>
                  <textarea
                    ref={directBodyRef}
                    value={directBody}
                    onChange={(e) => setDirectBody(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-card) p-3 font-mono text-[12px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                    placeholder={"本文を入力\n\n{{company_name}} → 企業名\n{{person_name}} → 担当者名\n{{AI:指示}} → AI生成"}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    ["company_name", "企業名"],
                    ["person_name", "担当者名"],
                    ["sender_name", "送信者名"],
                    ["service_name", "サービス名"],
                    ["lp_url", "LP"],
                    ["booking_url", "予約URL"],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertAtCursorDirect(`{{${v}}}`)}
                      className="inline-flex h-6 cursor-pointer items-center rounded border border-(--color-border) px-1.5 text-[10px] font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => insertAtCursorDirect("{{AI:}}", 2)}
                    className="inline-flex h-6 cursor-pointer items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    title="AIが企業ごとに書く部分。空なら全体になじむ文をAIが考える。: の後に指示も書ける"
                  >
                    <MagicWand size={10} weight="fill" />
                    AI
                  </button>
                </div>
              </div>
              {previewRecipient && hasContent && (
                <div className="border-t border-(--color-border) bg-gray-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between px-4 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">
                      差し込みプレビュー
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] tabular-nums text-(--color-muted)">
                        {clampedPreviewIndex + 1}/{checkedPreviewList.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                        disabled={clampedPreviewIndex === 0}
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-(--color-muted) hover:text-(--color-primary) disabled:opacity-30"
                      >
                        <CaretLeft size={11} weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewIndex((i) => Math.min(checkedPreviewList.length - 1, i + 1))}
                        disabled={clampedPreviewIndex >= checkedPreviewList.length - 1}
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-(--color-muted) hover:text-(--color-primary) disabled:opacity-30"
                      >
                        <CaretRight size={11} weight="bold" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto px-4 pb-3">
                    <p className="text-[11px] font-semibold">{buildEmail(previewRecipient).subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-[1.7] text-(--color-muted)">
                      {buildEmail(previewRecipient).body}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
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

              {previewRecipient && hasContent ? (
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
                    {!hasContent
                      ? "テンプレートを選択してください"
                      : "チェックした宛先のプレビューが表示されます"}
                  </p>
                </div>
              )}
            </>
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
            {hasGenerated && (
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
            )}
          </div>
          <div className="flex items-center gap-2">
            {(isSending || isGenerating) && (
              <button
                type="button"
                onClick={isSending ? handleCancelSending : handleCancelGenerating}
                className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-danger)/40 px-4 text-sm font-semibold text-(--color-danger) transition-colors hover:bg-(--color-danger-light)"
              >
                <X size={15} weight="bold" />
                中断
              </button>
            )}
            {!hasGenerated ? (
              <button
                type="button"
                onClick={handleGenerateAll}
                disabled={!hasContent || !selectedSenderId || checkedRecipients.length === 0 || isGenerating}
                className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGenerating ? (
                  <>
                    <SpinnerGap size={16} className="animate-spin" />
                    生成中... ({generateProgress.done}/{generateProgress.total})
                  </>
                ) : (
                  <>
                    <MagicWand size={16} weight="fill" />
                    {`選択した${checkedRecipients.length}件を生成`}
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendAll}
                disabled={!selectedSenderId || checkedRecipients.length === 0 || isSending}
                className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSending ? (
                  <SpinnerGap size={16} className="animate-spin" />
                ) : (
                  <PaperPlaneTilt size={16} weight="fill" />
                )}
                {isSending ? "送信中..." : `選択した${checkedRecipients.length}件を送信`}
              </button>
            )}
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

      {/* Companies Modal */}
      {companiesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setCompaniesOpen(false); }}
        >
          <div className="flex w-full max-w-[640px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <h3 className="text-[15px] font-semibold">企業一覧から宛先を追加</h3>
              <button
                type="button"
                onClick={() => setCompaniesOpen(false)}
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
                  value={companiesSearch}
                  onChange={(e) => setCompaniesSearch(e.target.value)}
                  placeholder="企業名・ドメイン・メールアドレスで検索"
                  className="h-9 w-full rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3">
              {companiesLoading ? (
                <div className="flex justify-center py-10">
                  <SpinnerGap size={24} className="animate-spin text-(--color-muted)" />
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-sm text-(--color-muted)">
                    {companiesSearch ? "該当する企業がありません" : "送れる状態の企業がありません"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredCompanies.map((company) => {
                    const contacts = contactsByCompanyId.get(company.id) ?? [];
                    const checked = companiesChecked.has(company.id);
                    return (
                      <label
                        key={company.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${checked ? "border-(--color-primary) bg-(--color-primary-light)/40" : "border-(--color-border) hover:border-(--color-primary)/50 hover:bg-(--color-card-hover)"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setCompaniesChecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(company.id)) next.delete(company.id);
                              else next.add(company.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{company.name}</p>
                          <p className="truncate text-[12px] text-(--color-muted)">
                            {contacts.map((c) => c.email).join(", ")}
                          </p>
                        </div>
                        {company.domain && (
                          <span className="shrink-0 text-[11px] text-(--color-muted)">{company.domain}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
              <span className="text-xs text-(--color-muted)">
                {companiesChecked.size > 0 && (
                  <>選択中: <strong className="font-semibold text-(--color-foreground)">{companiesChecked.size}</strong> 社</>
                )}
              </span>
              <button
                type="button"
                onClick={handleCompaniesImport}
                disabled={companiesChecked.size === 0}
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
          onClick={(e) => { if (e.target === e.currentTarget) closeImport(); }}
        >
          <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <h3 className="text-[15px] font-semibold">宛先を一括追加</h3>
              <button
                type="button"
                onClick={closeImport}
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
              ) : sheet ? (
                <>
                  <p className="mb-2 text-[12px] text-(--color-muted)">
                    それぞれの列が何かを指定してください（{sheet.rows.length}行を読み込みました）
                  </p>
                  <div className="max-h-[280px] overflow-auto rounded-lg border border-(--color-border)">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800">
                        <tr>
                          {columnKinds.map((kind, i) => (
                            <th key={i} className="border-b border-(--color-border) p-2 text-left">
                              <select
                                value={kind}
                                onChange={(e) =>
                                  setColumnKinds((prev) =>
                                    prev.map((k, idx) => (idx === i ? (e.target.value as ColumnKind) : k))
                                  )
                                }
                                className="h-8 w-full rounded-md border border-(--color-border) bg-(--color-card) px-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                              >
                                <option value="company">企業名</option>
                                <option value="person">担当者名</option>
                                <option value="email">メールアドレス</option>
                                <option value="lp_url">個社LPのURL</option>
                                <option value="ignore">使わない</option>
                              </select>
                              {sheet.headers[i] && (
                                <span className="mt-1 block truncate text-[10px] font-normal text-(--color-muted)">
                                  {sheet.headers[i]}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-b border-(--color-border) last:border-0">
                            {columnKinds.map((kind, ci) => (
                              <td
                                key={ci}
                                className={`max-w-[160px] truncate p-2 ${kind === "ignore" ? "text-(--color-muted) opacity-50" : ""}`}
                              >
                                {row[ci] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sheet.rows.length > 5 && (
                    <p className="mt-1.5 text-[11px] text-(--color-muted)">
                      先頭5行のみ表示しています（全{sheet.rows.length}行を取り込みます）
                    </p>
                  )}
                </>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsing}
                    className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-(--color-border) px-6 py-10 transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-light) disabled:opacity-50"
                  >
                    {parsing ? (
                      <SpinnerGap size={32} className="animate-spin text-(--color-primary)" />
                    ) : (
                      <FileArrowUp size={32} className="text-(--color-muted)" />
                    )}
                    <p className="text-[13px] text-(--color-muted)">
                      {parsing ? "読み込み中..." : "クリックしてファイルを選択"}
                    </p>
                    <p className="text-[11px] text-(--color-muted)">CSV・Excel（.xlsx）対応 / 最大10MB</p>
                  </button>
                  <p className="mt-2 text-[11px] leading-relaxed text-(--color-muted)">
                    ヘッダー行と文字コード（UTF-8 / Shift_JIS）は自動で判定します。
                    読み込んだあとに、どの列が企業名・担当者名・メールアドレスかを指定できます。
                  </p>
                </>
              )}

              {importError && (
                <p className="mt-2.5 rounded-lg bg-(--color-danger-light) px-3 py-2 text-[12px] text-(--color-danger)">
                  {importError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-(--color-border) bg-gray-50 px-5 py-3.5 dark:bg-slate-700/50">
              <span className="text-xs text-(--color-muted)">
                {importTab === "paste" && parsedPreview.length > 0 && (
                  <>検出: <strong className="font-semibold text-(--color-foreground)">{parsedPreview.length}</strong> 件の宛先</>
                )}
                {sheet && (
                  <>読み込み: <strong className="font-semibold text-(--color-foreground)">{sheet.rows.length}</strong> 行</>
                )}
              </span>
              <div className="flex gap-2">
                {sheet && (
                  <button
                    type="button"
                    onClick={() => { setSheet(null); setColumnKinds([]); setImportError(null); }}
                    className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) transition-colors hover:text-(--color-foreground)"
                  >
                    別のファイル
                  </button>
                )}
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
                {sheet && (
                  <button
                    type="button"
                    onClick={handleApplyMapping}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-[13px] font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
                  >
                    <Check size={14} weight="bold" />
                    この内容で追加
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Generated Email Picker Modal */}
      {generatedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setGeneratedOpen(false); }}
        >
          <div className="flex w-full max-w-[640px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-xl">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <h3 className="text-[15px] font-semibold">生成済みメールから引用</h3>
              <button
                type="button"
                onClick={() => setGeneratedOpen(false)}
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
                  value={generatedSearch}
                  onChange={(e) => setGeneratedSearch(e.target.value)}
                  placeholder="企業名・件名で検索"
                  className="h-9 w-full rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3">
              {generatedProspects.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-sm text-(--color-muted)">
                    {generatedSearch ? "該当する生成済みメールがありません" : "生成済みメールがありません"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="mb-2 text-[11px] leading-relaxed text-(--color-muted)">
                    選択したメールの件名・本文が直接入力欄に読み込まれます。
                    他社向けの内容が含まれている場合は、該当箇所を
                    <code className="mx-0.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-slate-700">{"{{AI:指示}}"}</code>
                    や変数に置き換えてから送信してください。
                  </p>
                  {generatedProspects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePickGenerated(p)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-(--color-border) px-4 py-3 text-left transition-colors hover:border-(--color-primary)/50 hover:bg-(--color-card-hover)"
                    >
                      <EnvelopeOpen size={18} className="shrink-0 text-(--color-muted)" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{p.company_name || p.domain}</p>
                        <p className="truncate text-[12px] text-(--color-muted)">{p.generated_subject}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-(--color-muted)">
                        {new Date(p.created_at).toLocaleDateString("ja-JP")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
