"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise,
  CheckCircle,
  EnvelopeSimple,
  GlobeSimple,
  Hourglass,
  PaperPlaneTilt,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import type { CompanyWithTag, Contact } from "@/lib/types";
import { normGenDomain } from "@/lib/gen-status";
import { useActiveService } from "@/components/service-context";
import { ActivityLogPanel } from "../activity-log-panel";
import { Toast } from "@/components/toast";
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "@/components/ui-kit";

const SOURCE_LABELS: Record<string, string> = {
  keyword_search: "キーワード検索",
  auto_collection: "自動収集",
  csv_import: "CSV取込",
  manual: "手動",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle; className: string }
> = {
  done: {
    label: "完了",
    icon: CheckCircle,
    className: "text-(--color-success-text)",
  },
  pending: {
    label: "準備中",
    icon: Hourglass,
    className: "text-(--color-warning-text)",
  },
  failed: {
    label: "調査できず",
    icon: XCircle,
    className: "text-(--color-danger-text)",
  },
  excluded: {
    label: "除外",
    icon: WarningCircle,
    className: "text-(--color-muted)",
  },
};

type StatusFilter = "all" | "done" | "pending" | "failed";

function isStatusFilter(value: string): value is StatusFilter {
  return value === "all" || value === "done" || value === "pending" || value === "failed";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  let iso = value.replace(" ", "T");
  if (!/[Z+]/.test(iso) && !/T\d{2}:\d{2}:\d{2}[+-]/.test(iso)) {
    iso += "Z";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 状態タブ・絞り込みボタンの見た目（押されているものだけアクセント塗り） */
const CHIP_BASE =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)";

function chipClass(active: boolean) {
  return `${CHIP_BASE} ${
    active
      ? "border-(--color-primary) bg-(--color-primary) text-white"
      : "border-(--color-border) bg-(--color-card) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary-text)"
  }`;
}

/**
 * 絞り込み select。幅は中身なり（ui-kit の FIELD は w-full なのでここでは使わない）。
 * appearance も既定のままにして、OS標準の▼が出る＝「選ぶもの」だと一目で分かるようにする。
 *
 * select の自動最小幅は「最長の option」なので、min-w-0 / max-w-full を付けないと
 * 長いキーワードが1件混ざるだけでページ全体が横スクロールする（M7: 384px で 77px はみ出し）。
 */
const FILTER_SELECT =
  "h-11 min-w-0 max-w-full rounded-lg border border-(--color-border) bg-(--color-card) px-2.5 text-[13px] text-(--color-foreground) transition-colors focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-primary)/25";

export default function CompaniesPage() {
  const router = useRouter();
  const { activeServiceId, services: allServices } = useActiveService();
  const [companies, setCompanies] = useState<CompanyWithTag[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  // 送信済みドメイン（send_log由来・正規化済み）。企業に「送信済み」を分かりやすく出すために使う
  const [sentDomains, setSentDomains] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  // F1 タグ絞り込み: どのキーワード・どの商材で集めた企業かで絞る
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  // null = まだ自分で選んでいない（上部バーの商材が初期値になる）
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  // 送信済み絞り込み（all / sent 送信済みのみ / unsent 未送信のみ）
  const [sentFilter, setSentFilter] = useState<"all" | "sent" | "unsent">("all");
  const [reEnriching, setReEnriching] = useState(false);
  const [enrichingPending, setEnrichingPending] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingHpId, setEditingHpId] = useState<number | null>(null);
  const [hpUrlInput, setHpUrlInput] = useState("");
  const [savingHpUrl, setSavingHpUrl] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(null);
    setTimeout(() => setToast(msg), 0);
  }, []);

  useEffect(() => {
    // ホームの状況カード（?status=pending 等）から来たときは、その状態タブを選んでおく。
    // useSearchParams は使わない（Suspense 境界が要る／履歴・ログインと同じ方針）。
    // 読むだけ・無ければ「すべて」
    try {
      const value = new URLSearchParams(window.location.search).get("status");
      if (value && isStatusFilter(value)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFilter(value);
      }
    } catch {
      /* クエリが壊れていても既定（すべて）で開く */
    }
  }, []);

  const saveHpUrl = useCallback(async (companyId: number, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSavingHpUrl(true);
    try {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: companyId, hp_url: trimmed }),
      });
      if (res.ok) {
        const { company } = await res.json();
        setCompanies((prev) =>
          prev.map((c) => (c.id === companyId ? { ...c, ...company } : c))
        );
        setEditingHpId(null);
        setHpUrlInput("");
        showToast("HP URLを保存しました");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "HP URLの保存に失敗しました");
      }
    } catch {
      showToast("HP URLの保存に失敗しました（通信エラー）");
    } finally {
      setSavingHpUrl(false);
    }
  }, [showToast]);

  const load = useCallback(async () => {
    try {
      const [res, genRes] = await Promise.all([
        fetch("/api/companies"),
        fetch("/api/companies/gen-status"),
      ]);
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies);
        setContacts(data.contacts);
      }
      if (genRes.ok) {
        const gen = await genRes.json().catch(() => ({}));
        setSentDomains(new Set((gen.sentDomains as string[] | undefined) ?? []));
      }
    } catch {
      /* next refresh will retry */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const contactsByCompany = useMemo(() => {
    const map = new Map<number, Contact[]>();
    for (const c of contacts) {
      if (c.company_id == null) continue;
      const list = map.get(c.company_id) ?? [];
      list.push(c);
      map.set(c.company_id, list);
    }
    return map;
  }, [contacts]);

  const noEmailCount = useMemo(() => {
    return companies.filter(
      (c) =>
        c.enrichment_status === "done" &&
        !(contactsByCompany.get(c.id) ?? []).some((ct) => ct.email),
    ).length;
  }, [companies, contactsByCompany]);

  const handleReEnrich = useCallback(async () => {
    setReEnriching(true);
    try {
      const res = await fetch("/api/companies/re-enrich", { method: "POST" });
      if (res.ok) {
        await load();
        showToast("メール未取得の企業を再調査キューに入れました");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "再調査の開始に失敗しました");
      }
    } catch {
      showToast("再調査の開始に失敗しました（通信エラー）");
    } finally {
      setReEnriching(false);
    }
  }, [load, showToast]);

  // 準備中（未調査）の企業をまとめて調査する。HP特定→メール抽出まで背景で進める。
  const handleEnrichPending = useCallback(async () => {
    setEnrichingPending(true);
    try {
      const res = await fetch("/api/companies/enrich-pending", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.started) {
        await load();
        showToast(`準備中${data.queued}社の調査を開始しました（HP取得・メール抽出。数分かかります）`);
      } else if (res.ok) {
        showToast(data.message || "準備中の企業はありません");
      } else {
        showToast(data.error || "調査の開始に失敗しました");
      }
    } catch {
      showToast("調査の開始に失敗しました（通信エラー）");
    } finally {
      setEnrichingPending(false);
    }
  }, [load, showToast]);

  // 調査済み企業のHPを再クロールし、登録社名がHPに現れない誤紐付けを是正する（連絡先無効化→再調査へ）。
  const handleReconcile = useCallback(async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/companies/reconcile", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.started) {
        await load();
        showToast(`${data.queued}社の整合チェックを開始しました（HP再クロールで社名照合。数分かかります）`);
      } else if (res.ok) {
        showToast(data.message || "整合チェックの対象企業はありません");
      } else {
        showToast(data.error || "整合チェックの開始に失敗しました");
      }
    } catch {
      showToast("整合チェックの開始に失敗しました（通信エラー）");
    } finally {
      setReconciling(false);
    }
  }, [load, showToast]);

  // 絞り込みの選択肢（実際に企業に付いているキーワード・商材だけ出す）
  const keywordOptions = useMemo(
    () => [...new Set(companies.map((c) => c.collection_keyword).filter((k): k is string => !!k))].sort(),
    [companies],
  );
  const serviceOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of companies) {
      if (c.collection_service_id != null && c.collection_service_name) {
        map.set(c.collection_service_id, c.collection_service_name);
      }
    }
    // 上部バーで選んでいる商材は、その商材の企業がまだ1社も無くても選択肢に残す。
    // 残さないと select の表示値だけ「すべての商材」に落ちて、上部バーの表示（商材A）と
    // 実際に出ている一覧（全商材）が食い違う＝切り替えても無反応に見える。
    if (activeServiceId !== null && !map.has(activeServiceId)) {
      const name = allServices.find((s) => s.id === activeServiceId)?.name;
      if (name) map.set(activeServiceId, name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [companies, activeServiceId, allServices]);

  // 上部バーの商材を初期値にする。画面の select で手動上書きできる（すべて＝従来どおり）。
  // この1つの値が「selectの表示値」であり「絞り込みに使う値」でもある（照合は商材の数値ID）。
  const serviceFilterValue =
    serviceFilter ??
    (activeServiceId !== null && serviceOptions.some(([id]) => id === activeServiceId)
      ? String(activeServiceId)
      : "all");

  // その企業のドメインに一度でも送信済みか（send_log 由来。単送信・一括・生成送信すべて含む）
  const isSent = (c: CompanyWithTag) => {
    const d = normGenDomain(c.domain);
    return !!d && sentDomains.has(d);
  };

  /**
   * キーワード・商材のタグ絞り込みだけを掛けた集合。
   * 状態タブ／送信済みタブの件数はここから数えるので、上部バーで商材を切り替えると
   * テーブルと件数が同時に追従する（片方だけ動いて食い違うことがない）。
   * 商材の照合は数値ID（collection_service_id）。名前では突き合わせない。
   */
  const scoped = useMemo(
    () =>
      companies.filter((c) => {
        if (keywordFilter !== "all" && c.collection_keyword !== keywordFilter) return false;
        if (serviceFilterValue !== "all" && String(c.collection_service_id) !== serviceFilterValue) return false;
        return true;
      }),
    [companies, keywordFilter, serviceFilterValue],
  );

  const filtered = scoped.filter((c) => {
    if (filter !== "all" && c.enrichment_status !== filter) return false;
    if (sentFilter === "sent" && !isSent(c)) return false;
    if (sentFilter === "unsent" && isSent(c)) return false;
    return true;
  });

  const selectableFiltered = useMemo(
    () => filtered.filter((c) => c.hp_url),
    [filtered],
  );

  const allSelectableChecked =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((c) => selectedIds.has(c.id));

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelectableChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableFiltered.map((c) => c.id)));
    }
  }

  function handleGenerateSelected() {
    const ids = companies
      .filter((c) => selectedIds.has(c.id) && c.hp_url)
      .map((c) => c.id);
    if (ids.length === 0) return;
    sessionStorage.setItem("batch-generate-company-ids", JSON.stringify(ids));
    router.push("/generate?mode=batch");
  }

  /** 状態タブに出す件数。いま掛かっているタグ絞り込み（キーワード・商材）の中で数える */
  const counts = {
    all: scoped.length,
    done: scoped.filter((c) => c.enrichment_status === "done").length,
    pending: scoped.filter((c) => c.enrichment_status === "pending").length,
    failed: scoped.filter((c) => c.enrichment_status === "failed").length,
    sent: scoped.filter(isSent).length,
  };

  /**
   * 一括操作（準備中の調査・整合チェック）はサーバ側で全企業を対象にするため、
   * ボタンの表示件数は絞り込み前の総数で出す（ボタンの数字と実際の対象がずれないように）。
   */
  const totals = {
    done: companies.filter((c) => c.enrichment_status === "done").length,
    pending: companies.filter((c) => c.enrichment_status === "pending").length,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-(--color-muted)">
        <SpinnerGap size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-(--color-muted)">
          自動収集・キーワード検索・CSV取込で集めた企業の一覧です。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {totals.pending > 0 && (
            <button
              type="button"
              onClick={handleEnrichPending}
              disabled={enrichingPending}
              title="準備中の企業すべてのHPを取得し、連絡先メールまで調査します（1社だけを選んで調べることはできません）"
              className={BTN_PRIMARY}
            >
              {enrichingPending ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <GlobeSimple size={16} />
              )}
              {enrichingPending ? "調査を開始中..." : `準備中${totals.pending}社を調査`}
            </button>
          )}
          {noEmailCount > 0 && (
            <button
              type="button"
              onClick={handleReEnrich}
              disabled={reEnriching}
              className={BTN_SECONDARY}
            >
              {reEnriching ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <EnvelopeSimple size={16} />
              )}
              {reEnriching
                ? "再取得中..."
                : `${noEmailCount}社のメールを再取得`}
            </button>
          )}
          {totals.done > 0 && (
            <button
              type="button"
              onClick={handleReconcile}
              disabled={reconciling}
              title="調査済み企業のHPを再クロールし、登録社名がそのHPに現れない誤紐付け（別会社のメアド）を自動で無効化・再調査に戻します"
              className={BTN_SECONDARY}
            >
              {reconciling ? (
                <SpinnerGap size={16} className="animate-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              {reconciling ? "整合チェック中..." : "整合チェック"}
            </button>
          )}
          <button type="button" onClick={load} className={BTN_SECONDARY}>
            <ArrowClockwise size={16} />
            更新
          </button>
        </div>
      </div>

      {/* 状態タブ＋絞り込み。件数付きで「いま何を見ているか」を常に出す */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "done", "pending", "failed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={chipClass(filter === key)}
          >
            {key === "all" ? "すべて" : STATUS_CONFIG[key]?.label ?? key}
            <span className="tabular-nums">({counts[key]})</span>
          </button>
        ))}

        {/* 送信済み/未送信の絞り込み。送信済み企業を一目で分けられるようにする */}
        <span className="mx-1 h-6 w-px bg-(--color-border)" aria-hidden />
        <button
          type="button"
          aria-pressed={sentFilter === "sent"}
          onClick={() => setSentFilter((v) => (v === "sent" ? "all" : "sent"))}
          title="一度でも送信したことがある企業だけを表示"
          className={chipClass(sentFilter === "sent")}
        >
          <PaperPlaneTilt size={14} weight={sentFilter === "sent" ? "fill" : "regular"} />
          送信済み<span className="tabular-nums">({counts.sent})</span>
        </button>
        <button
          type="button"
          aria-pressed={sentFilter === "unsent"}
          onClick={() => setSentFilter((v) => (v === "unsent" ? "all" : "unsent"))}
          title="まだ一度も送信していない企業だけを表示"
          className={chipClass(sentFilter === "unsent")}
        >
          未送信<span className="tabular-nums">({counts.all - counts.sent})</span>
        </button>

        {/* F1: キーワード・商材タグでの絞り込み（該当タグが1つでもある時だけ出す） */}
        {keywordOptions.length > 0 && (
          <select
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            title="収集キーワードで絞り込む"
            aria-label="収集キーワードで絞り込む"
            className={FILTER_SELECT}
          >
            <option value="all">すべてのキーワード</option>
            {keywordOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        )}
        {serviceOptions.length > 0 && (
          <select
            value={serviceFilterValue}
            onChange={(e) => setServiceFilter(e.target.value)}
            title="商材タグで絞り込む"
            aria-label="商材タグで絞り込む"
            className={FILTER_SELECT}
          >
            <option value="all">すべての商材</option>
            {serviceOptions.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {/* 選択バーはテーブルの直上（下部固定にしない＝モバイルの下部領域を奪わない） */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--color-primary) bg-(--color-primary-light) px-4 py-3 animate-fade-in">
          <p className="text-sm font-medium text-(--color-foreground)">
            <span className="tabular-nums text-(--color-primary-text)">{selectedIds.size}</span>社を選択中
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className={BTN_SECONDARY}
            >
              <X size={14} />
              選択解除
            </button>
            <button type="button" onClick={handleGenerateSelected} className={BTN_PRIMARY}>
              <PaperPlaneTilt size={16} weight="fill" />
              メール生成
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={`${CARD} px-6 py-16 text-center`}>
          <p className="text-[13px] text-(--color-muted)">
            {companies.length === 0
              ? "企業がまだありません。自動収集やキーワード検索で追加できます。"
              : "該当する企業がありません。"}
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          {/* 右端フェード = 「まだ右に続きがある」合図（スクロール不要な幅では自動的に消える） */}
          <div className="scroll-hint-x overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-(--color-border) bg-(--color-card-hover) text-left">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelectableChecked}
                      onChange={toggleAll}
                      aria-label="表示中の企業をすべて選択"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-(--color-primary)"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">企業名</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">メール</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">経路</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">ステータス</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">登録日</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((company) => {
                  const companyContacts = contactsByCompany.get(company.id) ?? [];
                  const email = companyContacts[0]?.email ?? null;
                  const cfg = STATUS_CONFIG[company.enrichment_status];
                  const StatusIcon = cfg?.icon ?? Hourglass;
                  const selected = selectedIds.has(company.id);
                  return (
                    <tr
                      key={company.id}
                      className={`border-b border-(--color-border) transition-colors motion-reduce:transition-none last:border-0 ${
                        selected ? "bg-(--color-primary-light)/50" : "hover:bg-(--color-card-hover)"
                      }`}
                    >
                      <td className="px-3 py-3 align-top">
                        {company.hp_url ? (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleOne(company.id)}
                            aria-label={`${company.name} を選択`}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-(--color-primary)"
                          />
                        ) : (
                          <span className="block h-4 w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-medium">{company.name}</p>
                          {isSent(company) && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-(--color-primary-light) px-1.5 py-0.5 text-[11px] font-medium text-(--color-primary-text)">
                              <PaperPlaneTilt size={11} weight="fill" />
                              送信済み
                            </span>
                          )}
                        </div>
                        {company.hp_url ? (
                          <p className="mt-0.5 max-w-[250px] truncate text-[12px] text-(--color-muted)">
                            {company.domain || company.hp_url}
                          </p>
                        ) : editingHpId === company.id ? (
                          <form
                            className="mt-1 flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveHpUrl(company.id, hpUrlInput);
                            }}
                          >
                            <input
                              type="url"
                              autoFocus
                              value={hpUrlInput}
                              onChange={(e) => setHpUrlInput(e.target.value)}
                              placeholder="https://example.com"
                              aria-label="企業HPのURL"
                              className="h-9 w-48 rounded border border-(--color-border) bg-transparent px-2 text-[13px] outline-none focus:border-(--color-primary)"
                            />
                            <button
                              type="submit"
                              disabled={savingHpUrl || !hpUrlInput.trim()}
                              className="h-9 cursor-pointer rounded bg-(--color-primary) px-2.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingHpUrl ? "..." : "保存"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingHpId(null); setHpUrlInput(""); }}
                              aria-label="HPの入力をやめる"
                              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded text-(--color-muted) hover:text-(--color-foreground)"
                            >
                              <X size={14} />
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setEditingHpId(company.id); setHpUrlInput(""); }}
                            className="mt-0.5 flex cursor-pointer items-center gap-1 text-[12px] text-(--color-primary-text) hover:underline"
                          >
                            <GlobeSimple size={13} />
                            HP追加
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-(--color-muted)">
                        {email ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="rounded bg-(--color-card-hover) px-2 py-0.5 text-[11px] text-(--color-muted)">
                          {company.source_detail || (SOURCE_LABELS[company.source] ?? company.source)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`flex items-center gap-1.5 whitespace-nowrap ${cfg?.className ?? ""}`}>
                          <StatusIcon size={15} weight="fill" />
                          {cfg?.label ?? company.enrichment_status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-(--color-muted)">
                        {formatDate(company.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ActivityLogPanel />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
