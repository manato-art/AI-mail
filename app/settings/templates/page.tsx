"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkSimple,
  Copy,
  MagicWand,
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
import {
  BTN_PRIMARY,
  Card,
  CountBadge,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  TEXTAREA,
} from "@/components/ui-kit";

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
  const [editComposeMode] = useState<ComposeMode>("fixed_only");
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

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string, cursorBack = 0) {
    const ta = bodyRef.current;
    if (!ta) { setEditBody((prev) => prev + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = editBody.slice(0, start);
    const after = editBody.slice(end);
    const updated = before + text + after;
    setEditBody(updated);
    // cursorBack > 0 なら挿入文字列の末尾から手前にカーソルを置く
    // （例: {{AI:}} を入れて : と }} の間にカーソルを置き、すぐ指示を書けるように）
    const caret = start + text.length - cursorBack;
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = caret;
      ta.selectionEnd = caret;
    });
  }

  function migrateHybridBody(t: TemplateWithAttachments): string {
    if (t.compose_mode !== "hybrid" || !t.fixed_part) return t.body;
    const brief = t.ai_brief ? `{{AI:${t.ai_brief}}}` : "";
    return `${t.fixed_part}${brief ? `\n\n${brief}` : ""}`;
  }

  function startEdit(t: TemplateWithAttachments) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditSubject(t.subject);
    setEditBody(migrateHybridBody(t));
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
            fixed_part: "",
            ai_brief: "",
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
            fixed_part: "",
            ai_brief: "",
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
          <SpinnerGap size={24} className="animate-spin text-(--color-primary-text)" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {templates.length > 0 && <CountBadge count={templates.length} />}
          <p className="text-[13px] leading-relaxed text-(--color-muted)">
            一括送信で選べるメールの型です
          </p>
        </div>
        <button type="button" onClick={startCreate} disabled={isEditing} className={BTN_PRIMARY}>
          <Plus size={16} weight="bold" />
          新規作成
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(260px,1fr)_1.6fr]">
        {/* Left: template list */}
        <div className="space-y-2.5">
          {templates.length === 0 && !creating && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--color-border) bg-(--color-card) px-6 py-16 text-center">
              <BookmarkSimple size={30} className="text-(--color-muted)" />
              <p className="text-sm font-medium">テンプレートがありません</p>
              <p className="text-[13px] leading-relaxed text-(--color-muted)">
                メール詳細画面の「テンプレ保存」から追加できます
              </p>
            </div>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => startEdit(t)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEdit(t); }}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border bg-(--color-card) py-3 pl-4 pr-2 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${editingId === t.id ? "border-(--color-primary) ring-2 ring-(--color-primary)/15" : "border-(--color-border) hover:border-(--color-primary)/40 hover:bg-(--color-card-hover)"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p className="mt-0.5 truncate text-[13px] text-(--color-muted)">{t.subject || "件名なし"}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[12px] tabular-nums text-(--color-muted)">{formatDate(t.updated_at)}</p>
                  {t.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-(--color-primary-light) px-2 py-0.5 text-[12px] font-semibold text-(--color-primary-text)">
                      <Paperclip size={11} weight="bold" />
                      {t.attachments.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => handleCopy(t)} className={ICON_BTN} title="コピー" aria-label="コピー">
                  <Copy size={16} />
                </button>
                <button type="button" onClick={() => handleDelete(t.id)} className={ICON_BTN_DANGER} title="削除" aria-label="削除">
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right: edit panel */}
        {isEditing && (
          <Card
            className="sticky top-6 h-fit animate-fade-in"
            title={creating ? "新規テンプレート" : "テンプレート編集"}
            Icon={BookmarkSimple}
            action={
              <button
                type="button"
                onClick={cancelEdit}
                className={ICON_BTN}
                title="閉じる"
                aria-label="閉じる"
              >
                <X size={16} />
              </button>
            }
            bodyClassName="space-y-4 p-5"
          >
              <div>
                <label htmlFor="template-name" className={LABEL}>テンプレート名</label>
                <input
                  id="template-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={FIELD}
                  placeholder="テンプレート名"
                />
              </div>
              <div>
                <label htmlFor="template-subject" className={LABEL}>件名</label>
                <input
                  id="template-subject"
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className={FIELD}
                  placeholder="メールの件名"
                />
              </div>
              <div>
                <label htmlFor="template-body" className={LABEL}>
                  本文
                </label>
                <textarea
                  id="template-body"
                  ref={bodyRef}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={12}
                  className={`${TEXTAREA} font-mono leading-[1.8]`}
                  placeholder={"{{company_name}}\n{{person_name}}様\n\n突然のご連絡失礼いたします。\n\n{{AI:相手企業の事業内容に触れつつ、自社サービスとの接点を1〜2文で書いてください}}\n\nぜひ一度お話の機会をいただけましたら幸いです。"}
                />
                <div className="mt-2.5 rounded-lg border border-(--color-border) bg-(--color-background) px-3.5 py-3">
                  <p className="text-[13px] font-semibold text-(--color-muted)">
                    本文に挿入できるマーカー
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
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
                        onClick={() => insertAtCursor(variable!)}
                        className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border border-(--color-border) bg-(--color-card) px-2.5 py-1 text-[13px] transition-colors motion-reduce:transition-none hover:border-(--color-primary) hover:text-(--color-primary-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                        title="カーソル位置に挿入"
                      >
                        <code>{variable}</code>
                        <span className="text-(--color-muted)">{label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => insertAtCursor("{{AI:}}", 2)}
                      className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[13px] font-semibold text-amber-700 transition-colors motion-reduce:transition-none hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                      title="AIが企業ごとに書き分ける部分を挿入（指示は任意）"
                    >
                      <MagicWand size={13} weight="bold" className="shrink-0" />
                      <code>{"{{AI:}}"}</code>
                      <span className="font-normal">AIが書く部分</span>
                    </button>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-(--color-muted)">
                    <strong>固定テキスト</strong>はそのまま送られます。<strong>{"{{変数}}"}</strong>は宛先ごとに置換。<strong>{"{{AI:}}"}</strong>を入れた部分は、収集した企業の分析データをもとにAIが企業ごとに書き分けます。<strong>{"{{AI:}}"}</strong>だけなら<strong>メール全体に自然になじむ文</strong>をAIが考えます。指示を出したいときは <code>{"{{AI:実績に触れて}}"}</code> のように <code>:</code> の後に書きます。どこにでも何個でも置けます。
                  </p>
                </div>
              </div>
              {/* F22: 初回メールに資料を添付する事故を構造的に防ぐ */}
              <div className="rounded-lg border border-(--color-border) bg-(--color-background) p-4">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={editAllowAttachments}
                    onChange={(e) => setEditAllowAttachments(e.target.checked)}
                    className="mt-0.5 h-5 w-5 cursor-pointer accent-(--color-primary)"
                  />
                  <span className="text-sm font-medium">
                    このテンプレートで資料の添付を許可する
                    <span className="mt-1.5 block text-[13px] font-normal leading-relaxed text-(--color-muted)">
                      <strong>初回メールには添付しない</strong>のが方針です（迷惑メール判定や警戒を招くため）。
                      返信をもらった後の2通目以降や「資料希望」への返信に使うテンプレートだけONにしてください。
                      OFFのままなら、一括送信の画面でも添付を選べません。
                    </span>
                  </span>
                </label>
              </div>

              <div className={editAllowAttachments ? "" : "pointer-events-none opacity-40"}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-(--color-foreground)">
                    添付資料{!editAllowAttachments && "（このテンプレートでは無効）"}
                  </span>
                  <button
                    type="button"
                    disabled={!editAllowAttachments}
                    onClick={() => setPickerOpen((v) => !v)}
                    className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-(--color-primary-text) transition-colors motion-reduce:transition-none hover:bg-(--color-primary-light) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                  >
                    <Plus size={13} weight="bold" />
                    資料を選ぶ
                  </button>
                </div>

                {selectedAttachments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-(--color-border) px-3 py-3.5 text-center text-[13px] text-(--color-muted)">
                    添付なし
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedAttachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-(--color-border) py-1.5 pl-3 pr-1.5"
                      >
                        <Paperclip size={15} className="shrink-0 text-(--color-muted)" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{a.filename}</p>
                          <p className="text-[12px] text-(--color-muted)">{formatBytes(a.size_bytes)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAttachment(a.id)}
                          className={ICON_BTN_DANGER}
                          title="このテンプレートから外す"
                          aria-label="このテンプレートから外す"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pickerOpen && (
                  <div className="mt-2.5 animate-fade-in rounded-lg border border-(--color-border) bg-(--color-background) p-3">
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
                      className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-(--color-primary)/50 text-[13px] font-semibold text-(--color-primary-text) transition-colors motion-reduce:transition-none hover:bg-(--color-primary-light) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploading ? <SpinnerGap size={15} className="animate-spin" /> : <UploadSimple size={15} />}
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
                                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors motion-reduce:transition-none hover:bg-(--color-card) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                              >
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                    checked
                                      ? "border-(--color-primary) bg-(--color-primary) text-white"
                                      : "border-(--color-border)"
                                  }`}
                                >
                                  {checked && <Check size={12} weight="bold" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px]">{a.filename}</span>
                                  <span className="block text-[12px] text-(--color-muted)">{formatBytes(a.size_bytes)}</span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFromLibrary(a)}
                                className={ICON_BTN_DANGER}
                                title="資料一覧から削除"
                                aria-label="資料一覧から削除"
                              >
                                <Trash size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="mt-2 text-[12px] leading-relaxed text-(--color-muted)">
                      PDF・Word・Excel・PowerPoint・画像・テキスト・CSV・ZIP／1ファイル10MBまで
                    </p>
                  </div>
                )}
              </div>

              <button type="button" onClick={handleSave} disabled={saving} className={`${BTN_PRIMARY} w-full`}>
                {saving ? <SpinnerGap size={16} className="animate-spin" /> : <FloppyDisk size={16} />}
                {saving ? "保存中..." : "保存"}
              </button>
          </Card>
        )}
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
