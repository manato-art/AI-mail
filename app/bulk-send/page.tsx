"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  Check,
  EnvelopeOpen,
  Paperclip,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type { Attachment, Prospect, Service, TemplateWithAttachments } from "@/lib/types";
import { Toast } from "@/components/toast";
import { useActiveService } from "@/components/service-context";
import { resolveEmailVariables } from "@/lib/variables";
import { uid, type Recipient, type SenderInfo } from "./shared";
import { useSendRun } from "./use-send-run";
import { useGeneratedSend } from "./use-generated-send";
import { useImport } from "./use-import";
import { useAddRecipients } from "./use-add-recipients";
import { RecipientTable } from "./ui/recipient-table";
import { RightPanel } from "./ui/right-panel";
import { DirectEditor } from "./ui/direct-editor";
import { StepSection } from "./ui/step-section";
import { SendFooter } from "./ui/send-footer";
import { HistoryModal } from "./ui/history-modal";
import { CompaniesModal } from "./ui/companies-modal";
import { ImportModal } from "./ui/import-modal";
import { GeneratedPanel } from "./ui/generated-panel";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function BulkSendPage() {
  const { activeServiceId } = useActiveService();
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
  const [services, setServices] = useState<Service[]>([]);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsHydrated, setRecipientsHydrated] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // ②③の開閉。null = まだ自分で開閉していない（宛先が1件以上あれば自動で開く）
  const [stepTwoOpen, setStepTwoOpen] = useState<boolean | null>(null);
  const [stepThreeOpen, setStepThreeOpen] = useState<boolean | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [tplRes, pRes, sRes, sendersRes, attachRes, svcRes] = await Promise.all([
          fetch("/api/templates"),
          fetch("/api/prospects"),
          fetch("/api/settings"),
          fetch("/api/senders"),
          fetch("/api/attachments"),
          fetch("/api/services"),
        ]);
        const tplData: TemplateWithAttachments[] = tplRes.ok ? await tplRes.json() : [];
        const pData: Prospect[] = pRes.ok ? await pRes.json() : [];
        const sData = sRes.ok ? await sRes.json() : {};
        const sendersData: SenderInfo[] = sendersRes.ok ? await sendersRes.json() : [];
        const attachData: Attachment[] = attachRes.ok ? await attachRes.json() : [];
        const svcData: Service[] = svcRes.ok ? await svcRes.json() : [];
        if (!cancelled) {
          setTemplates(tplData);
          setProspects(pData);
          setTestMode(sData.test_mode === "true");
          setSenders(sendersData);
          if (sendersData.length > 0) setSelectedSenderId(sendersData[0].id);
          setAttachmentsLib(attachData);
          setServices(svcData);
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

  const sorted = useMemo(
    () => [...prospects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [prospects]
  );

  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? templates.find((t) => t.id === Number(selectedTemplateId)) : undefined),
    [templates, selectedTemplateId]
  );

  const serviceNameOf = useCallback(
    (id: number) => services.find((s) => s.id === id)?.name ?? "",
    [services]
  );

  /** 上部バーで選んでいる商材の名前（企業一覧は名前で絞り込むため） */
  const activeServiceName = activeServiceId === null ? null : serviceNameOf(activeServiceId) || null;

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

  const run = useSendRun({
    inputMode,
    selectedTemplate,
    selectedSenderId,
    senders,
    directSubject,
    directBody,
    checkedRecipients,
    selectedAttachmentIds,
    testMode,
    buildEmail,
    setPreviewIndex,
    showToast,
  });

  const gen = useGeneratedSend({
    sorted,
    prospects,
    setProspects,
    serviceNameOf,
    senders,
    selectedSenderId,
    testMode,
    allowWarnings: run.allowWarnings,
    showToast,
    open: generatedOpen,
    activeServiceId,
  });

  const imp = useImport({ recipients, setRecipients, showToast });

  const add = useAddRecipients({
    sorted,
    serviceNameOf,
    recipients,
    setRecipients,
    showToast,
    activeServiceId,
    activeServiceName,
  });

  useEffect(() => {
    if (!run.isSending && recipients.length === 0) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [run.isSending, recipients.length]);

  function handlePickGenerated(p: Prospect) {
    setDirectSubject(p.generated_subject);
    setDirectBody(p.generated_body);
    setGeneratedOpen(false);
    gen.setGeneratedSearch("");
    if (inputMode !== "direct") setInputMode("direct");
    showToast("生成済みメールを読み込みました");
  }

  function openGenerated() {
    setGeneratedOpen(true);
    gen.setGeneratedSearch("");
  }

  /**
   * F22: テンプレを変えたら選択済みの添付を落とす。
   * 添付不可のテンプレに残したままだとサーバ側の422で全件失敗する。
   */
  function handleTemplateChange(nextId: string) {
    setSelectedTemplateId(nextId);
    setSelectedAttachmentIds(new Set());
    // テンプレを変えたら、旧テンプレで生成した本文キャッシュを破棄する。
    // 残すと「新テンプレのIDで旧テンプレの本文を送る」取り違えが起きる。
    run.resetGeneratedCache();
  }

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

  function handlePreviewRow(id: string) {
    const idx = checkedPreviewList.findIndex((cr) => cr.id === id);
    if (idx >= 0) setPreviewIndex(idx);
  }


  const canQuoteGenerated = prospects.some((p) => p.generated_subject && p.generated_body && p.input_url);
  const allChecked = recipients.length > 0 && recipients.every((r) => r.checked);
  const hasRecipients = recipients.length > 0;
  // ②③は宛先が0件のうちは畳んでおく（初見で見える塊を減らす）。自分で開閉したらそれを優先する
  const twoOpen = stepTwoOpen ?? hasRecipients;
  const threeOpen = stepThreeOpen ?? (hasRecipients || senders.length === 0);

  /** ②の見出し行に出す入力方法の切替。折りたたみ中でも押せて、押すと②が開く */
  const inputModeSwitch = (
    <div className="flex overflow-hidden rounded-lg border border-(--color-border)">
      <button
        type="button"
        onClick={() => { setInputMode("template"); setStepTwoOpen(true); }}
        className={`min-h-11 cursor-pointer px-3 text-center text-[13px] font-medium transition-colors motion-reduce:transition-none ${
          inputMode === "template" ? "bg-(--color-primary-light) font-semibold text-(--color-primary)" : "text-(--color-muted) hover:bg-(--color-card-hover)"
        }`}
      >
        テンプレートから送信
      </button>
      <button
        type="button"
        onClick={() => { setInputMode("direct"); setStepTwoOpen(true); }}
        className={`min-h-11 cursor-pointer border-l border-(--color-border) px-3 text-center text-[13px] font-medium transition-colors motion-reduce:transition-none ${
          inputMode === "direct" ? "bg-(--color-primary-light) font-semibold text-(--color-primary)" : "text-(--color-muted) hover:bg-(--color-card-hover)"
        }`}
      >
        直接入力して送信
      </button>
    </div>
  );

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
    <div className={`animate-fade-in ${hasRecipients ? "pb-48" : "pb-10"}`}>
      <div className="mb-1">
        <h1 className="text-xl font-bold tracking-tight">メール一括送信</h1>
        <p className="text-[13px] text-(--color-muted)">宛先リストを作成し、メールを一括送信します</p>
      </div>

      {/* Test mode badge */}
      {testMode && (
        <div className="mt-5 rounded-xl border border-(--color-border) bg-(--color-primary-light) px-4 py-3 text-[13px] font-medium text-(--color-primary)">
          テストモード中: すべてのメールはテストアドレス宛に送信されます
        </div>
      )}

      {/* 「生成」で作った個別メールを各社へまとめて送る入口 */}
      {canQuoteGenerated && (
        <button
          type="button"
          onClick={openGenerated}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-(--color-primary)/50 bg-(--color-primary-light)/40 py-2.5 text-[13px] font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
        >
          <EnvelopeOpen size={15} />
          「生成」で作った個別メールを各社へ送信
        </button>
      )}

      <div className="mt-5 space-y-4">
        {/* ① だれに送る */}
        <StepSection
          step={1}
          title="だれに送る"
          hint="送りたい会社をこの一覧にそろえます"
          open
          id="bulk-step-recipients"
          bodyClassName=""
        >
          <RecipientTable
            flush
            recipients={recipients}
            allChecked={allChecked}
            rowStatus={run.rowStatus}
            hasContent={hasContent}
            buildEmail={buildEmail}
            onToggleAll={handleToggleAll}
            onToggle={handleToggle}
            onUpdate={handleUpdateRecipient}
            onDelete={handleDelete}
            onPreviewRow={handlePreviewRow}
            onAddOne={handleAddOne}
            onOpenImport={imp.openImport}
            onOpenHistory={add.openHistory}
            onOpenCompanies={add.openCompaniesModal}
          />
        </StepSection>

        {/* ② なにを送る */}
        <StepSection
          step={2}
          title="なにを送る"
          hint="テンプレートを選ぶか、その場で書きます"
          open={twoOpen}
          onToggle={() => setStepTwoOpen(!twoOpen)}
          headerExtra={inputModeSwitch}
          id="bulk-step-content"
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              {/* テンプレートが1件も無い場合の導線（テンプレートモード時のみ） */}
              {inputMode === "template" && templates.length === 0 && (
                <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-(--color-warning-light) p-4 text-sm dark:border-amber-800">
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

              {inputMode === "template" ? (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                    テンプレートメール
                  </label>
                  <div className="relative">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
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
              ) : (
                <DirectEditor
                  directSubject={directSubject}
                  setDirectSubject={setDirectSubject}
                  directBody={directBody}
                  setDirectBody={setDirectBody}
                  directBodyRef={directBodyRef}
                  insertAtCursorDirect={insertAtCursorDirect}
                  canQuoteGenerated={canQuoteGenerated}
                  onOpenGenerated={openGenerated}
                />
              )}

              {/* F22: 添付が許可されていないテンプレでは、添付欄そのものを出さない */}
              {inputMode === "template" && selectedTemplate && !selectedTemplate.allow_attachments && attachmentsLib.length > 0 && (
                <p className="text-[12px] text-(--color-muted)">
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
                <div>
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
                          disabled={run.isSending}
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
            </div>

            {/* 右: 生成結果の編集 / 実際に届くメール */}
            <RightPanel
              hasGenerated={run.hasGenerated}
              previewRecipient={previewRecipient}
              generatedEmails={run.generatedEmails}
              isSending={run.isSending}
              onClearGenerated={run.handleClearGenerated}
              onUpdateGenerated={run.handleUpdateGenerated}
              clampedPreviewIndex={clampedPreviewIndex}
              previewCount={checkedPreviewList.length}
              setPreviewIndex={setPreviewIndex}
              inputMode={inputMode}
              buildEmail={buildEmail}
              hasContent={hasContent}
              checkedCount={checkedRecipients.length}
            />
          </div>
        </StepSection>

        {/* ③ だれから送る */}
        <StepSection
          step={3}
          title="だれから送る"
          hint="どのGmailアカウントから送るかを選びます"
          open={threeOpen}
          onToggle={() => setStepThreeOpen(!threeOpen)}
          id="bulk-step-sender"
        >
          {senders.length === 0 ? (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-(--color-warning-light) p-4 text-sm dark:border-amber-800">
              <Warning className="mt-0.5 shrink-0" size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
              <p className="text-gray-700 dark:text-gray-300">
                Gmailアカウントが未接続です。一括送信には
                <Link href="/settings" className="mx-1 font-medium text-(--color-primary) underline underline-offset-2">
                  設定ページ
                </Link>
                からGmail接続が必要です。
              </p>
            </div>
          ) : (
            <div className="max-w-[420px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                送信元アカウント
              </label>
              <div className="relative">
                <select
                  value={selectedSenderId ?? ""}
                  onChange={(e) => setSelectedSenderId(Number(e.target.value))}
                  className="h-11 w-full appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
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
        </StepSection>
      </div>

      {/* 下部固定の送信バー */}
      {hasRecipients && (
        <SendFooter
          checkedCount={checkedRecipients.length}
          totalCount={recipients.length}
          hasGenerated={run.hasGenerated}
          allowWarnings={run.allowWarnings}
          setAllowWarnings={run.setAllowWarnings}
          isSending={run.isSending}
          isGenerating={run.isGenerating}
          hasContent={hasContent}
          senderSelected={!!selectedSenderId}
          generateProgress={run.generateProgress}
          bulkScheduledAt={run.bulkScheduledAt}
          setBulkScheduledAt={run.setBulkScheduledAt}
          onCancelSending={run.handleCancelSending}
          onCancelGenerating={run.handleCancelGenerating}
          onGenerate={run.handleGenerateAll}
          onSend={run.handleSendAll}
        />
      )}

      {/* History Modal */}
      {add.historyOpen && (
        <HistoryModal
          onClose={add.closeHistory}
          historySearch={add.historySearch}
          setHistorySearch={add.setHistorySearch}
          historyServiceFilter={add.historyServiceFilter}
          setHistoryServiceFilter={add.setHistoryServiceFilter}
          historyServiceOptions={add.historyServiceOptions}
          sentProspects={add.sentProspects}
          historyChecked={add.historyChecked}
          setHistoryChecked={add.setHistoryChecked}
          allHistoryChecked={add.allHistoryChecked}
          toggleHistoryAll={add.toggleHistoryAll}
          onImport={add.handleHistoryImport}
        />
      )}

      {/* Companies Modal */}
      {add.companiesOpen && (
        <CompaniesModal
          onClose={add.closeCompanies}
          companiesSearch={add.companiesSearch}
          setCompaniesSearch={add.setCompaniesSearch}
          companyKeywordOptions={add.companyKeywordOptions}
          companiesKeywordFilter={add.companiesKeywordFilter}
          setCompaniesKeywordFilter={add.setCompaniesKeywordFilter}
          companyServiceOptions={add.companyServiceOptions}
          companiesServiceFilter={add.companiesServiceFilter}
          setCompaniesServiceFilter={add.setCompaniesServiceFilter}
          companiesLoading={add.companiesLoading}
          filteredCompanies={add.filteredCompanies}
          contactsByCompanyId={add.contactsByCompanyId}
          companiesChecked={add.companiesChecked}
          setCompaniesChecked={add.setCompaniesChecked}
          allCompaniesModalChecked={add.allCompaniesModalChecked}
          toggleCompaniesModalAll={add.toggleCompaniesModalAll}
          onImport={add.handleCompaniesImport}
        />
      )}

      {/* Import Modal */}
      {imp.importOpen && (
        <ImportModal
          onClose={imp.closeImport}
          importTab={imp.importTab}
          setImportTab={imp.setImportTab}
          pasteText={imp.pasteText}
          setPasteText={imp.setPasteText}
          parsedPreviewCount={imp.parsedPreview.length}
          onPasteImport={imp.handleImport}
          fileInputRef={imp.fileInputRef}
          onPickFile={imp.handleImportFile}
          parsing={imp.parsing}
          sheet={imp.sheet}
          resetSheet={imp.resetSheet}
          columnKinds={imp.columnKinds}
          setColumnKinds={imp.setColumnKinds}
          onApplyMapping={imp.handleApplyMapping}
          importError={imp.importError}
        />
      )}

      {/* Generated Email Picker Modal */}
      {generatedOpen && (
        <GeneratedPanel
          gen={gen}
          onClose={() => setGeneratedOpen(false)}
          onPick={handlePickGenerated}
          senderSelected={!!selectedSenderId}
          testMode={testMode}
          serviceNameOf={serviceNameOf}
        />
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
