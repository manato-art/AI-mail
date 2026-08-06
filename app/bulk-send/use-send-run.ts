"use client";

import { useRef, useState } from "react";
import type { TemplateWithAttachments } from "@/lib/types";
import type { GeneratedEmail, Recipient, RowStatus, SenderInfo } from "./shared";

/**
 * テンプレ一斉送信の「生成」と「送信/予約」の直列ループ（page.tsx から移動しただけ）。
 *
 * 触ってはいけない安全弁:
 *  - 同一メールアドレスは先頭1件だけ送る(#7)。残りは理由付きでスキップ表示
 *  - 中断は「現在の1件を送り終えてから」停止する（cancelRef）
 *  - 生成時の warnings(#5) を捨てずに保持する（送信時はサーバ側ゲートが発火しない）
 *  - acknowledgedWarnings を必ず送信APIへ伝播する（既定 false）
 */

interface Options {
  inputMode: "template" | "direct";
  selectedTemplate: TemplateWithAttachments | undefined;
  selectedSenderId: number | null;
  /** 画面で選択中の商材。渡さないと API 側で「登録順の先頭」が黙って使われる */
  activeServiceId: number | null;
  senders: SenderInfo[];
  directSubject: string;
  directBody: string;
  checkedRecipients: Recipient[];
  selectedAttachmentIds: Set<number>;
  testMode: boolean;
  buildEmail: (r: Recipient) => { subject: string; body: string; unresolved: string[] };
  setPreviewIndex: (index: number) => void;
  showToast: (msg: string) => void;
}

export function useSendRun({
  inputMode,
  selectedTemplate,
  selectedSenderId,
  activeServiceId,
  senders,
  directSubject,
  directBody,
  checkedRecipients,
  selectedAttachmentIds,
  testMode,
  buildEmail,
  setPreviewIndex,
  showToast,
}: Options) {
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [isSending, setIsSending] = useState(false);
  const [allowWarnings, setAllowWarnings] = useState(false);
  const [bulkScheduledAt, setBulkScheduledAt] = useState("");
  /** 送信ループの中断フラグ。現在の1件を送り終えてから止まる */
  const cancelRef = useRef(false);

  const [generatedEmails, setGeneratedEmails] = useState<Record<string, GeneratedEmail>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });
  const cancelGenerateRef = useRef(false);

  async function handleSendAll() {
    const canSend = inputMode === "template"
      ? !!selectedTemplate && !!selectedSenderId
      : !!(directSubject.trim() && directBody.trim() && selectedSenderId);
    if (!canSend || checkedRecipients.length === 0 || isSending) return;
    const candidates = checkedRecipients.filter(
      (r) => r.email && rowStatus[r.id]?.state !== "sent"
    );
    if (candidates.length === 0) { showToast("送信対象がありません"); return; }

    // 同一メールアドレスの重複は1回だけ送る（#7: リスト内の重複による二重送信を防ぐ）。
    // 先頭の1件だけ送り、以降の重複行は理由付きでスキップ表示する。
    const seenEmails = new Set<string>();
    const toSend: typeof candidates = [];
    const duplicateRows: typeof candidates = [];
    for (const r of candidates) {
      const key = r.email.trim().toLowerCase();
      if (seenEmails.has(key)) { duplicateRows.push(r); continue; }
      seenEmails.add(key);
      toSend.push(r);
    }
    if (duplicateRows.length > 0) {
      setRowStatus((prev) => {
        const next = { ...prev };
        for (const r of duplicateRows) {
          next[r.id] = {
            state: "failed",
            error: "同一メールアドレスが重複しているためスキップしました（先頭の1件のみ送信）",
          };
        }
        return next;
      });
    }

    // 予約日時が入っていれば送信ではなく予約にする
    const scheduledIso = bulkScheduledAt ? new Date(bulkScheduledAt).toISOString() : "";
    if (scheduledIso && new Date(bulkScheduledAt).getTime() <= Date.now()) {
      showToast("予約日時は現在より先の時刻を指定してください");
      return;
    }
    const isSchedule = !!scheduledIso;
    const whenLabel = isSchedule ? new Date(bulkScheduledAt).toLocaleString("ja-JP") : "";

    const sender = senders.find((s) => s.id === selectedSenderId);
    const dupNote = duplicateRows.length > 0 ? `（重複 ${duplicateRows.length}件は除外）` : "";
    const confirmMsg = isSchedule
      ? `${toSend.length}件のメールを ${whenLabel} に送信予約します${dupNote}。よろしいですか？`
      : testMode
        ? `テストモード: ${toSend.length}件分をテストアドレス宛に送信します${dupNote}。よろしいですか？`
        : `${toSend.length}件のメールを ${sender?.email ?? ""} から送信します${dupNote}。よろしいですか？`;
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
            ...(activeServiceId !== null && { serviceId: activeServiceId }),
            templateId: inputMode === "template" ? selectedTemplate?.id : undefined,
            company: r.company,
            person: r.person,
            email: r.email,
            subject,
            body: emailBody,
            attachmentIds: [...selectedAttachmentIds],
            acknowledgedWarnings: allowWarnings,
            ...(scheduledIso && { scheduledAt: scheduledIso }),
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
        } else if (data.scheduled) {
          setRowStatus((prev) => ({ ...prev, [r.id]: { state: "scheduled" } }));
          okCount++;
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
      isSchedule
        ? (failCount === 0 ? `${okCount}件を予約しました` : `予約完了: 成功${okCount}件 / 失敗${failCount}件`)
        : (failCount === 0 ? `${okCount}件を送信しました` : `送信完了: 成功${okCount}件 / 失敗${failCount}件`)
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
            ...(activeServiceId !== null && { serviceId: activeServiceId }),
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
          // #5: 企業分析が取れず汎用文になった場合の警告を捨てず、生成結果に保持して
          // 編集パネルで送信前に見せる（送信時は生成済み本文を送るのでサーバ側ゲートは
          // {{AI:}} が消えていて発火しない。ここで拾わないと無警告のまま汎用文が飛ぶ）。
          const genWarnings = Array.isArray(data.warnings) ? (data.warnings as string[]) : undefined;
          setGeneratedEmails((prev) => ({
            ...prev,
            [r.id]: { subject: data.subject, body: data.body, warnings: genWarnings },
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

  /** テンプレ変更時: 旧テンプレの本文キャッシュと行状態を捨てる（F22） */
  function resetGeneratedCache() {
    setGeneratedEmails({});
    setRowStatus({});
  }

  const hasGenerated = Object.keys(generatedEmails).length > 0;

  return {
    rowStatus,
    generatedEmails,
    hasGenerated,
    isSending,
    isGenerating,
    generateProgress,
    allowWarnings,
    setAllowWarnings,
    bulkScheduledAt,
    setBulkScheduledAt,
    handleSendAll,
    handleCancelSending,
    handleGenerateAll,
    handleCancelGenerating,
    handleUpdateGenerated,
    handleClearGenerated,
    resetGeneratedCache,
  };
}
