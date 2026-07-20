"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkSimple,
  Copy,
  PencilSimple,
  Paperclip,
  Plus,
  SpinnerGap,
  Trash,
  UploadSimple,
  X,
  Check,
  FloppyDisk,
} from "@phosphor-icons/react";
import type { Attachment, ComposeMode, Template, TemplateWithAttachments } from "@/lib/types";
import { Toast } from "@/components/toast";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateWithAttachments[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editComposeMode, setEditComposeMode] = useState<ComposeMode>("fixed_only");
  const [editFixedPart, setEditFixedPart] = useState("");
  const [editAiBrief, setEditAiBrief] = useState("");
  const [editAllowAttachments, setEditAllowAttachments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [library, setLibrary] = useState<Attachment[]>([]);
  const [editAttachmentIds, setEditAttachmentIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [tplRes, attRes] = await Promise.all([
          fetch("/api/templates"),
          fetch("/api/attachments"),
        ]);
        const tplData = tplRes.ok ? await tplRes.json() : [];
        const attData = attRes.ok ? await attRes.json() : [];
        if (!cancelled) {
          setTemplates(tplData);
          setLibrary(attData);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function startEdit(t: TemplateWithAttachments) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditSubject(t.subject);
    setEditBody(t.body);
    setEditComposeMode(t.compose_mode ?? "fixed_only");
    setEditFixedPart(t.fixed_part ?? "");
    setEditAiBrief(t.ai_brief ?? "");
    setEditAllowAttachments(Boolean(t.allow_attachments));
    setEditAttachmentIds(t.attachments.map((a) => a.id));
    setCreating(false);
    setPickerOpen(false);
  }

  function startCreate() {
    setEditingId(null);
    setEditName("");
    setEditSubject("");
    setEditBody("");
    setEditComposeMode("fixed_only");
    setEditFixedPart("");
    setEditAiBrief("");
    setEditAllowAttachments(false);
    setEditAttachmentIds([]);
    setCreating(true);
    setPickerOpen(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
    setEditAttachmentIds([]);
    setPickerOpen(false);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "アップロードに失敗しました");
        return;
      }
      const created: Attachment = data;
      setLibrary((prev) => [created, ...prev]);
      setEditAttachmentIds((prev) => [...prev, created.id]);
      showToast(`${created.filename} を追加しました`);
    } catch {
      showToast("アップロードに失敗しました");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function toggleAttachment(id: number) {
    setEditAttachmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleDeleteFromLibrary(attachment: Attachment) {
    if (!confirm(`「${attachment.filename}」を資料一覧から削除しますか？\nこの資料を使っている全テンプレートから外れます。`)) return;
    try {
      const res = await fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLibrary((prev) => prev.filter((a) => a.id !== attachment.id));
      setEditAttachmentIds((prev) => prev.filter((x) => x !== attachment.id));
      setTemplates((prev) =>
        prev.map((t) => ({ ...t, attachments: t.attachments.filter((a) => a.id !== attachment.id) }))
      );
      showToast("資料を削除しました");
    } catch {
      showToast("資料の削除に失敗しました");
    }
  }

  async function saveAttachmentLinks(templateId: number): Promise<Attachment[]> {
    const res = await fetch(`/api/templates/${templateId}/attachments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentIds: editAttachmentIds }),
    });
    if (!res.ok) throw new Error("添付資料の紐付けに失敗しました");
    return res.json();
  }

  async function handleSave() {
    if (!editName.trim()) { showToast("テンプレート名を入力してください"); return; }
    setSaving(true);
    try {
      if (creating) {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            subject: editSubject,
            body: editBody,
            compose_mode: editComposeMode,
            fixed_part: editFixedPart,
            ai_brief: editAiBrief,
            allow_attachments: editAllowAttachments ? 1 : 0,
          }),
        });
        if (!res.ok) throw new Error();
        const created: Template = await res.json();
        const attachments = await saveAttachmentLinks(created.id);
        setTemplates((prev) => [{ ...created, attachments }, ...prev]);
        showToast("テンプレートを作成しました");
      } else if (editingId !== null) {
        const res = await fetch(`/api/templates/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            subject: editSubject,
            body: editBody,
            compose_mode: editComposeMode,
            fixed_part: editFixedPart,
            ai_brief: editAiBrief,
            allow_attachments: editAllowAttachments ? 1 : 0,
          }),
        });
        if (!res.ok) throw new Error();
        const updated: Template = await res.json();
        const attachments = await saveAttachmentLinks(updated.id);
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingId ? { ...updated, attachments } : t))
        );
        showToast("テンプレートを更新しました");
      }
      cancelEdit();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    try {
      await fetch(`/api/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) cancelEdit();
      showToast("テンプレートを削除しました");
    } catch {
      showToast("削除に失敗しました");
    }
  }

  async function handleCopy(t: Template) {
    try {
      await navigator.clipboard.writeText(`${t.subject}\n\n${t.body}`);
      showToast("コピーしました");
    } catch {
      showToast("コピーに失敗しました");
    }
  }

  const isEditing = creating || editingId !== null;

  // Ordered by the user's selection order, not library order.
  const selectedAttachments = useMemo(
    () =>
      editAttachmentIds
        .map((id) => library.find((a) => a.id === id))
        .filter((a): a is Attachment => Boolean(a)),
    [editAttachmentIds, library]
  );

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-(--color-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {templates.length > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-(--color-primary-light) px-2 text-xs font-semibold text-(--color-primary)">
              {templates.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={isEditing}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-3.5 text-xs font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} weight="bold" />
          新規作成
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_2fr]">
        {/* Left: template list */}
        <div className="space-y-2">
          {templates.length === 0 && !creating && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-card) px-6 py-16 text-center">
              <BookmarkSimple size={28} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-(--color-muted)">テンプレートがありません</p>
              <p className="text-xs text-(--color-muted)">メール詳細画面の「テンプレ保存」から追加できます</p>
            </div>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => startEdit(t)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEdit(t); }}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-(--color-card) px-4 py-3 transition-colors ${editingId === t.id ? "border-(--color-primary) ring-2 ring-(--color-primary)/10" : "border-(--color-border) hover:border-(--color-primary)/40"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p className="mt-0.5 truncate text-xs text-(--color-muted)">{t.subject || "件名なし"}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-[10px] text-(--color-muted)">{formatDate(t.updated_at)}</p>
                  {t.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-(--color-primary-light) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-primary)">
                      <Paperclip size={10} weight="bold" />
                      {t.attachments.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => handleCopy(t)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) hover:bg-(--color-primary-light) hover:text-(--color-primary)" title="コピー">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={() => handleDelete(t.id)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--color-muted) hover:bg-(--color-danger-light) hover:text-(--color-danger)" title="削除">
                  <Trash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right: edit panel */}
        {isEditing && (
          <div className="sticky top-6 h-fit overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card) animate-fade-in">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3.5">
              <h2 className="text-sm font-semibold">{creating ? "新規テンプレート" : "テンプレート編集"}</h2>
              <button type="button" onClick={cancelEdit} className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-(--color-muted) hover:bg-(--color-danger-light) hover:text-(--color-danger)">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">テンプレート名</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                  placeholder="テンプレート名"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">件名</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                  placeholder="メールの件名"
                />
              </div>
              {/* F4: 文面の作り方 */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                  文面の作り方
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["fixed_only", "そのまま送る", "書いた文章をそのまま使う。差し込み変数だけ置き換わる"],
                    ["hybrid", "冒頭は固定＋続きはAI", "決めた冒頭をそのまま使い、続きだけAIが相手に合わせて書く"],
                  ] as [ComposeMode, string, string][]).map(([mode, label, desc]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setEditComposeMode(mode)}
                      className={`cursor-pointer rounded-lg border-2 p-3 text-left transition-all ${
                        editComposeMode === mode
                          ? "border-(--color-primary) bg-(--color-primary-light)"
                          : "border-(--color-border) hover:border-(--color-primary)/40"
                      }`}
                    >
                      <span className="block text-[13px] font-semibold">{label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-(--color-muted)">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {editComposeMode === "hybrid" && (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                      冒頭（この通りに送られます）
                    </label>
                    <textarea
                      value={editFixedPart}
                      onChange={(e) => setEditFixedPart(e.target.value)}
                      rows={5}
                      className="w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-3 text-[13px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                      placeholder={"{{company_name}}\n{{person_name}}様\n\n突然のご連絡失礼いたします。\nCypher One株式会社の金谷と申します。"}
                    />
                    <p className="mt-1 text-[11px] text-(--color-muted)">
                      ここに書いた文章は<strong>一字一句そのまま</strong>送られます（差し込み変数のみ置換）。
                      送信直前に改変されていないか機械的に確認します。
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                      続きの書き方（AIへの指示）
                    </label>
                    <textarea
                      value={editAiBrief}
                      onChange={(e) => setEditAiBrief(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-3 text-[13px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                      placeholder="この後、インターン採用の課題に触れつつ、15分ほどのオンライン相談を提案して締めてください。"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                  {editComposeMode === "hybrid" ? "本文（この作り方では使いません）" : "本文"}
                </label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-3 text-[13px] leading-[1.8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                  placeholder="メール本文"
                />
                <div className="mt-2 rounded-lg border border-(--color-border) bg-gray-50 px-3 py-2.5 dark:bg-slate-800">
                  <p className="text-[11px] font-medium text-(--color-muted)">
                    一括送信で宛先ごとに差し替わる変数（件名でも使えます）
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[
                      ["{{company_name}}", "企業名"],
                      ["{{person_name}}", "担当者名"],
                      ["{{sender_name}}", "送信者名"],
                      ["{{service_name}}", "商材名"],
                      ["{{lp_url}}", "商材のLP URL"],
                    ].map(([variable, label]) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => setEditBody((prev) => prev + variable)}
                        className="cursor-pointer rounded border border-(--color-border) bg-(--color-card) px-2 py-1 text-[11px] transition-colors hover:border-(--color-primary) hover:text-(--color-primary)"
                        title="クリックで本文末尾に挿入"
                      >
                        <code>{variable}</code>
                        <span className="ml-1 text-(--color-muted)">{label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-(--color-muted)">
                    値が入らなかった変数はそのまま残り、送信前にブロックされます。
                    特定の1社にしか当てはまらない記述（実績・沿革など）は書かないでください。
                  </p>
                </div>
              </div>
              {/* F22: 初回メールに資料を添付する事故を構造的に防ぐ */}
              <div className="rounded-lg border border-(--color-border) bg-gray-50 p-3.5 dark:bg-slate-800">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={editAllowAttachments}
                    onChange={(e) => setEditAllowAttachments(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-(--color-primary)"
                  />
                  <span className="text-[13px]">
                    このテンプレートで資料の添付を許可する
                    <span className="mt-1 block text-[11px] leading-relaxed text-(--color-muted)">
                      <strong>初回メールには添付しない</strong>のが方針です（迷惑メール判定や警戒を招くため）。
                      返信をもらった後の2通目以降や「資料希望」への返信に使うテンプレートだけONにしてください。
                      OFFのままなら、一括送信の画面でも添付を選べません。
                    </span>
                  </span>
                </label>
              </div>

              <div className={editAllowAttachments ? "" : "pointer-events-none opacity-40"}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                    添付資料{!editAllowAttachments && "（このテンプレートでは無効）"}
                  </label>
                  <button
                    type="button"
                    disabled={!editAllowAttachments}
                    onClick={() => setPickerOpen((v) => !v)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-(--color-primary) transition-colors hover:bg-(--color-primary-light)"
                  >
                    <Plus size={11} weight="bold" />
                    資料を選ぶ
                  </button>
                </div>

                {selectedAttachments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-(--color-border) px-3 py-3 text-center text-xs text-(--color-muted)">
                    添付なし
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedAttachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-(--color-border) px-3 py-2"
                      >
                        <Paperclip size={13} className="shrink-0 text-(--color-muted)" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{a.filename}</p>
                          <p className="text-[10px] text-(--color-muted)">{formatBytes(a.size_bytes)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAttachment(a.id)}
                          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--color-muted) hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                          title="このテンプレートから外す"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pickerOpen && (
                  <div className="mt-2 rounded-lg border border-(--color-border) bg-(--color-card-hover) p-3 animate-fade-in">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-(--color-primary)/50 text-xs font-semibold text-(--color-primary) transition-colors hover:bg-(--color-primary-light) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploading ? <SpinnerGap size={13} className="animate-spin" /> : <UploadSimple size={13} />}
                      {uploading ? "アップロード中..." : "新しい資料をアップロード"}
                    </button>

                    {library.length > 0 && (
                      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                        {library.map((a) => {
                          const checked = editAttachmentIds.includes(a.id);
                          return (
                            <div key={a.id} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleAttachment(a.id)}
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-(--color-card)"
                              >
                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                    checked
                                      ? "border-(--color-primary) bg-(--color-primary) text-white"
                                      : "border-(--color-border)"
                                  }`}
                                >
                                  {checked && <Check size={10} weight="bold" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs">{a.filename}</span>
                                  <span className="block text-[10px] text-(--color-muted)">{formatBytes(a.size_bytes)}</span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFromLibrary(a)}
                                className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--color-muted) hover:bg-(--color-danger-light) hover:text-(--color-danger)"
                                title="資料一覧から削除"
                              >
                                <Trash size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="mt-2 text-[10px] leading-relaxed text-(--color-muted)">
                      PDF・Word・Excel・PowerPoint・画像・テキスト・CSV・ZIP／1ファイル10MBまで
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--color-primary) text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
