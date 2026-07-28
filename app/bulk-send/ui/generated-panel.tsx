"use client";

import { CaretDown, MagnifyingGlass, PaperPlaneTilt, SpinnerGap, X } from "@phosphor-icons/react";
import type { Prospect } from "@/lib/types";
import type { SenderInfo } from "../shared";
import { firstEmailOf, type GeneratedSendApi } from "../use-generated-send";

/**
 * 「生成」で作った個別メールを各社へまとめて送る面（モード2タブの片方）。
 * 送信済み/予約済み/メアド無し/古い重複は選べない（チェックボックスを無効化する）。
 *
 * 送信バーは画面下に固定する。左サイドバーの幅ぶん padding を空けるのを忘れない。
 */
interface GeneratedPanelProps {
  gen: GeneratedSendApi;
  /** 「引用」= 直接入力の下書きに読み込む */
  onPick: (p: Prospect) => void;
  senders: SenderInfo[];
  selectedSenderId: number | null;
  onChangeSender: (id: number) => void;
  testMode: boolean;
  serviceNameOf: (id: number) => string;
}

export function GeneratedPanel({
  gen,
  onPick,
  senders,
  selectedSenderId,
  onChangeSender,
  testMode,
  serviceNameOf,
}: GeneratedPanelProps) {
  return (
    <section
      aria-labelledby="bulk-generated-title"
      className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-card)"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border) px-4 py-3 md:px-5">
        <h2 id="bulk-generated-title" className="text-[15px] font-semibold">生成済みメールを各社へ送信</h2>
        {senders.length > 0 && (
          <div className="relative">
            <select
              value={selectedSenderId ?? ""}
              onChange={(e) => onChangeSender(Number(e.target.value))}
              aria-label="送信元アカウント"
              className="h-11 appearance-none rounded-lg border border-(--color-border) bg-(--color-card) px-3 pr-9 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
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
        )}
      </div>

      <div className="px-4 pt-4 pb-3 md:px-5">
        <div className="relative">
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
          <input
            type="text"
            value={gen.generatedSearch}
            onChange={(e) => gen.setGeneratedSearch(e.target.value)}
            placeholder="企業名・件名で検索"
            className="h-11 w-full rounded-lg border border-(--color-border) bg-gray-50 pl-9 pr-3 text-[13px] focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <select
            value={gen.genEmailFilter}
            onChange={(e) => gen.setGenEmailFilter(e.target.value)}
            aria-label="メール有無で絞り込む"
            className="h-11 rounded-lg border border-(--color-border) bg-gray-50 px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
          >
            <option value="">✉️ メアド有無：すべて</option>
            <option value="has">✉️ メアドあり</option>
            <option value="none">⚠️ メアド未取得</option>
          </select>
          <select
            value={gen.genSendFilter}
            onChange={(e) => gen.setGenSendFilter(e.target.value)}
            aria-label="送信状況で絞り込む"
            className="h-11 rounded-lg border border-(--color-border) bg-gray-50 px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
          >
            <option value="">送信状況：すべて</option>
            <option value="unsent">まだ送っていない</option>
            <option value="sent">送信済み</option>
            <option value="scheduled">予約済み</option>
          </select>
          {gen.genServiceOptions.length > 0 && (
            <select
              value={gen.genServiceFilter}
              onChange={(e) => gen.setGenServiceFilter(e.target.value)}
              aria-label="商材で絞り込む"
              className="h-11 rounded-lg border border-(--color-border) bg-gray-50 px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10 dark:bg-slate-800"
            >
              <option value="">📦 すべての商材</option>
              {gen.genServiceOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>📦 {s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 md:px-5">
        {gen.generatedProspects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-(--color-muted)">
              {gen.generatedSearch ? "該当する生成済みメールがありません" : "生成済みメールがありません"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="mb-2 text-[13px] leading-relaxed text-(--color-muted)">
              チェックした生成メールを、<b>各社の個別本文のまま</b>それぞれの会社のメアドへまとめて送信できます（メアドあり・未送信のみ対象）。
              「内容」で本文の確認・編集、「引用」で直接入力欄のテンプレに読み込みます。
            </p>
            <div className="sticky top-0 z-10 mb-1.5 flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-2">
              <label className={`flex items-center gap-2 ${gen.genSelectable.length > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                <input
                  type="checkbox"
                  checked={gen.allGenSelected}
                  onChange={gen.toggleGenSelectAll}
                  disabled={gen.genSelectable.length === 0 || gen.sendingGenerated}
                  className="h-4 w-4 cursor-pointer accent-(--color-primary) disabled:cursor-not-allowed"
                />
                <span className="text-[13px] font-medium text-(--color-muted)">
                  すべて選択（送信可能 {gen.genSelectable.length}件）
                </span>
              </label>
              {gen.generatedChecked.size > 0 && (
                <span className="text-[13px] font-medium text-(--color-primary-text)">{gen.generatedChecked.size}件選択中</span>
              )}
            </div>
            {gen.generatedProspects.map((p) => {
              const email = firstEmailOf(p);
              const already = p.send_status === "sent";
              const scheduled = p.send_status === "scheduled";
              // 送信済み・予約済みはどちらも「対応済み」= 選択対象外にまとめる
              const done = already || scheduled;
              const st = gen.genRowStatus[p.id];
              const selectable = !!email && !done;
              const editing = gen.genEditingId === p.id;
              const svcName = serviceNameOf(p.service_id);
              // 同一宛先に、より新しい生成メールがある＝この行は古い重複（既定では選ばれない）
              const isOlderDup = !!email && !done && !gen.genSelectableIds.has(p.id);
              return (
                <div key={p.id} className="rounded-lg border border-(--color-border)">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={gen.generatedChecked.has(p.id)}
                      disabled={!selectable || gen.sendingGenerated}
                      onChange={() =>
                        gen.setGeneratedChecked((prev) => {
                          const n = new Set(prev);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                      className="h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary) disabled:cursor-not-allowed disabled:opacity-40"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{p.company_name || p.domain}</p>
                      <p className="truncate text-[13px] text-(--color-muted)">{p.subject}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {email ? (
                          <span className="truncate text-(--color-muted)">{email}</span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⚠️ メアド無し</span>
                        )}
                        {isOlderDup && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="同じ宛先に新しい生成メールがあります。既定では最新の1件だけ送ります">
                            重複（最新を選択中）
                          </span>
                        )}
                        {svcName && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">📦 {svcName}</span>
                        )}
                        {already && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">📨 送信済み</span>
                        )}
                        {scheduled && (
                          <span className="rounded bg-(--color-primary-light) px-1.5 py-0.5 text-[10px] font-medium text-(--color-primary-text)">⏰ 予約済み</span>
                        )}
                        {st?.state === "sending" && <span className="text-(--color-primary-text)">処理中…</span>}
                        {st?.state === "sent" && <span className="font-medium text-(--color-success-text)">✓ 送信しました</span>}
                        {st?.state === "scheduled" && <span className="font-medium text-(--color-primary-text)">⏰ 予約しました</span>}
                        {st?.state === "failed" && <span className="text-(--color-danger-text)">✕ {st.error}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => gen.toggleGenEdit(p)}
                      className={`shrink-0 cursor-pointer rounded-lg border px-2.5 py-1 text-[13px] font-medium transition-colors ${
                        editing
                          ? "border-(--color-primary) text-(--color-primary-text)"
                          : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary-text)"
                      }`}
                    >
                      {editing ? "閉じる" : "内容"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPick(p)}
                      className="shrink-0 cursor-pointer rounded-lg border border-(--color-border) px-2.5 py-1 text-[13px] font-medium text-(--color-muted) transition-colors hover:border-(--color-primary) hover:text-(--color-primary-text)"
                    >
                      引用
                    </button>
                  </div>
                  {editing && (
                    <div className="space-y-2 border-t border-(--color-border) bg-gray-50/60 px-3 py-3 dark:bg-slate-800/40">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">件名</label>
                        <input
                          type="text"
                          value={gen.genEditSubject}
                          onChange={(e) => gen.setGenEditSubject(e.target.value)}
                          className="h-11 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 text-[13px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-(--color-muted)">本文（この会社に実際に届く内容）</label>
                        <textarea
                          value={gen.genEditBody}
                          onChange={(e) => gen.setGenEditBody(e.target.value)}
                          rows={12}
                          className="w-full rounded-lg border border-(--color-border) bg-(--color-card) p-3 text-[13px] leading-[1.9] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => gen.setGenEditingId(null)}
                          className="min-h-11 cursor-pointer rounded-lg border border-(--color-border) px-3 text-[13px] font-medium text-(--color-muted) hover:bg-(--color-card-hover)"
                        >
                          キャンセル
                        </button>
                        <button
                          type="button"
                          onClick={() => gen.handleSaveGenEdit(p)}
                          disabled={gen.genSavingEdit}
                          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                        >
                          {gen.genSavingEdit ? <SpinnerGap size={13} className="animate-spin" /> : null}
                          保存（この内容で送る）
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {gen.generatedProspects.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-(--color-border) bg-(--color-card)/95 backdrop-blur-sm md:pl-16 xl:pl-60">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-6">
            <span className="text-[13px] text-(--color-muted)">
              {!selectedSenderId
                ? "先に送信者（人格）を選択してください"
                : gen.generatedChecked.size > 0
                  ? `${gen.generatedChecked.size}件を選択中`
                  : "送信するメールにチェック"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-(--color-muted)">
                <span className="whitespace-nowrap">予約（任意）</span>
                <input
                  type="datetime-local"
                  value={gen.genScheduledAt}
                  onChange={(e) => gen.setGenScheduledAt(e.target.value)}
                  className="h-11 rounded-lg border border-(--color-border) bg-(--color-card) px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-(--color-primary)/10"
                />
                {gen.genScheduledAt && (
                  <button type="button" onClick={() => gen.setGenScheduledAt("")} className="cursor-pointer text-(--color-muted) hover:text-(--color-danger-text)" aria-label="予約日時をクリア">
                    <X size={13} />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={gen.handleSendGenerated}
                disabled={gen.sendingGenerated || gen.generatedChecked.size === 0 || !selectedSenderId}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-(--color-primary) px-6 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                {gen.sendingGenerated ? (
                  <SpinnerGap size={15} className="animate-spin" />
                ) : (
                  <PaperPlaneTilt size={15} weight="fill" />
                )}
                {gen.genScheduledAt ? "予約送信" : testMode ? "テスト送信" : "選択を各社へ送信"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
