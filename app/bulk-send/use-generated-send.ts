"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Prospect } from "@/lib/types";
import {
  buildHandledCompanies,
  firstEmailFromJson,
  selectSendableRows,
  type SkipReason,
} from "@/lib/generated-dedup";
import type { GenRowStatus, SenderInfo } from "./shared";

/**
 * 「生成」で作った個別メールを各社へまとめて送る側の状態と処理。
 *
 * page.tsx から切り出しただけで、ロジックは1文字も変えていない
 * （安全弁: 送信済/予約済の除外・宛先ごと最新1件のdedup・予約はサーバ一括）。
 * フックなので状態の寿命は page 本体に置いていたときと同じ。
 */

/** 生成済みメールに紐づく送信先メール（HP分析時に見つけたもの）を1件返す */
export function firstEmailOf(p: Prospect): string | null {
  return firstEmailFromJson(p.emails_found_json);
}

interface Options {
  /** 作成日時の降順に並べた prospects（先頭が最新） */
  sorted: Prospect[];
  prospects: Prospect[];
  setProspects: Dispatch<SetStateAction<Prospect[]>>;
  serviceNameOf: (id: number) => string;
  senders: SenderInfo[];
  selectedSenderId: number | null;
  testMode: boolean;
  allowWarnings: boolean;
  showToast: (msg: string) => void;
  /** 生成済みメールの面が開いているか。開いた瞬間に既定選択を作る */
  open: boolean;
  /** 上部バーで選んでいる商材。商材フィルタの初期値にだけ使う（APIには渡さない） */
  activeServiceId: number | null;
}

export function useGeneratedSend({
  sorted,
  prospects,
  setProspects,
  serviceNameOf,
  senders,
  selectedSenderId,
  testMode,
  allowWarnings,
  showToast,
  open,
  activeServiceId,
}: Options) {
  const [generatedSearch, setGeneratedSearch] = useState("");
  const [generatedChecked, setGeneratedChecked] = useState<Set<number>>(new Set());
  const [sendingGenerated, setSendingGenerated] = useState(false);
  const [genRowStatus, setGenRowStatus] = useState<Record<number, GenRowStatus>>({});
  const [genScheduledAt, setGenScheduledAt] = useState("");
  const [genEmailFilter, setGenEmailFilter] = useState("");
  /** 送信状況の絞り込み: "" すべて / "unsent" 未送信 / "sent" 送信済み / "scheduled" 予約済み */
  const [genSendFilter, setGenSendFilter] = useState("");
  // null = まだ自分で選んでいない（上部バーの商材が初期値になる）
  const [genServiceFilterState, setGenServiceFilter] = useState<string | null>(null);
  // 生成メールの内容プレビュー/編集（展開中の1件）
  const [genEditingId, setGenEditingId] = useState<number | null>(null);
  const [genEditSubject, setGenEditSubject] = useState("");
  const [genEditBody, setGenEditBody] = useState("");
  const [genSavingEdit, setGenSavingEdit] = useState(false);

  /** 生成メールに実際に使われている商材の選択肢（service_id → 名前） */
  const genServiceOptions = useMemo(() => {
    const ids = new Set<number>();
    for (const p of prospects) {
      if (p.generated_subject && p.generated_body && p.input_url) ids.add(p.service_id);
    }
    return [...ids].map((id) => ({ id, name: serviceNameOf(id) || `#${id}` }));
  }, [prospects, serviceNameOf]);

  // 上部バーの商材が選択肢に無いときは「すべての商材」のまま（空の一覧を見せない）
  const genServiceFilter =
    genServiceFilterState ??
    (activeServiceId !== null && genServiceOptions.some((o) => o.id === activeServiceId)
      ? String(activeServiceId)
      : "");

  /**
   * 既に対応済み（送信済み・予約済み）の会社。**絞り込み前の全生成メール**から作る。
   * 絞り込み後の一覧から作ると、商材や検索で隠れている送信済みを見落として
   * 「同じ会社にまた送れる」ように見えてしまう。
   *
   * サーバ側の重複ガードは送信ログ（直近90日）で判定するが、画面はこの一覧の
   * 送信済み/予約済みで判定する。ユーザー決定（同じ会社には一回だけ）に沿う側に倒している。
   */
  const handledCompanies = useMemo(() => buildHandledCompanies(prospects), [prospects]);

  const { generatedProspects, genSelectable, genRowNote, genHiddenCount } = useMemo(() => {
    const q = generatedSearch.toLowerCase();
    // 並び順（作成日時の新しい順）は変えない＝「同じ会社は最新の1件だけ送る」判定がこの順序に依存する
    const base = sorted
      .filter((p) => p.generated_subject && p.generated_body && p.input_url)
      .filter((p) => {
        if (genEmailFilter === "has") return !!firstEmailOf(p);
        if (genEmailFilter === "none") return !firstEmailOf(p);
        return true;
      })
      .filter((p) => !genServiceFilter || p.service_id === Number(genServiceFilter))
      .filter((p) =>
        !q ||
        (p.company_name || "").toLowerCase().includes(q) ||
        (p.generated_subject || "").toLowerCase().includes(q)
      );

    // 会社単位の選別（サーバ側の重複ガードと同じ会社キーで判定する）
    const { sendable, skipped } = selectSendableRows(base, handledCompanies);

    let visible = base;
    let hidden = 0;
    if (genSendFilter === "sent") {
      visible = base.filter((p) => p.send_status === "sent");
    } else if (genSendFilter === "scheduled") {
      visible = base.filter((p) => p.send_status === "scheduled");
    } else if (genSendFilter === "unsent") {
      // 「まだ送っていない」＝**この会社に**まだ送っていない。同じ会社の重複や、
      // 会社として送信済み/予約済みの行をここに残すと、送れないものを送れるように見せてしまう。
      const isOpen = (p: Prospect) =>
        p.send_status !== "sent" && p.send_status !== "scheduled";
      visible = base.filter((p) => isOpen(p) && !skipped.has(p.id));
      hidden = base.filter((p) => isOpen(p) && skipped.has(p.id)).length;
    }

    const visibleIds = new Set(visible.map((p) => p.id));
    return {
      generatedProspects: visible,
      // 画面に出ていない行を「すべて選択」で拾わない
      genSelectable: sendable.filter((p) => visibleIds.has(p.id)),
      /** 送らない行と理由（画面のバッジ用）。会社として対応済み／同じ会社の古い重複 */
      genRowNote: skipped as Map<number, SkipReason>,
      /** 「まだ送っていない」で会社単位に畳んで隠した件数（黙って減らさず件数を出す） */
      genHiddenCount: hidden,
    };
  }, [sorted, generatedSearch, genEmailFilter, genServiceFilter, genSendFilter, handledCompanies]);

  /** 各社で「最新＝送信対象」に選ばれた生成メールのID。これ以外の同じ会社の行は重複扱い */
  const genSelectableIds = useMemo(() => new Set(genSelectable.map((p) => p.id)), [genSelectable]);
  const allGenSelected =
    genSelectable.length > 0 && genSelectable.every((p) => generatedChecked.has(p.id));

  function toggleGenSelectAll() {
    // 全選択は「各社の最新1件」だけ。同じ会社の古い重複・対応済みの会社は選ばない
    if (allGenSelected) setGeneratedChecked(new Set());
    else setGeneratedChecked(new Set(genSelectable.map((p) => p.id)));
  }

  // 生成済みメールの面を開いた時、各社の最新1件をデフォルトで選択済みにする
  useEffect(() => {
    if (open) setGeneratedChecked(new Set(genSelectable.map((p) => p.id)));
    // 開いた瞬間だけ既定選択する（絞り込み変更では選択をリセットしない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 選択した生成済みメールを、各社の個別本文のまま各社のメアドへまとめて送る（既存の個別送信APIを流用） */
  async function handleSendGenerated() {
    if (!selectedSenderId) {
      showToast("送信者（人格）を選択してください");
      return;
    }
    // 同じ会社へは1通だけ（最新）。チェックに古い重複や対応済みの会社が混じっていても、
    // 画面の一覧と同じ選別（＝サーバ側の重複ガードと同じ会社キー）でここでも絞る。
    const targets = selectSendableRows(
      generatedProspects.filter((p) => generatedChecked.has(p.id)),
      handledCompanies
    ).sendable;
    if (targets.length === 0) {
      showToast("送信できる選択がありません（メアドあり・その会社にまだ送っていないものだけ）");
      return;
    }
    // 予約日時が入っていれば送信ではなく予約にする
    const scheduledIso = genScheduledAt ? new Date(genScheduledAt).toISOString() : "";
    if (scheduledIso && new Date(genScheduledAt).getTime() <= Date.now()) {
      showToast("予約日時は現在より先の時刻を指定してください");
      return;
    }
    const isSchedule = !!scheduledIso;
    const whenLabel = isSchedule ? new Date(genScheduledAt).toLocaleString("ja-JP") : "";

    const sender = senders.find((s) => s.id === selectedSenderId);
    const confirmMsg = isSchedule
      ? `生成メール${targets.length}件を ${whenLabel} に送信予約します。よろしいですか？`
      : testMode
        ? `テストモード: 生成メール${targets.length}件をテストアドレス宛に送信します。よろしいですか？`
        : `生成した個別メール${targets.length}件を、それぞれの会社（${sender?.email ?? ""} から）へ送信します。よろしいですか？`;
    if (!confirm(confirmMsg)) return;

    // 予約はサーバ側で一括処理する。フロントの直列ループと違い、途中でモーダルを閉じたり
    // 別ページへ移動しても全件が確実に予約される（「50件予約したのに一部だけ予約済」を防ぐ）。
    if (isSchedule) {
      setSendingGenerated(true);
      targets.forEach((p) => setGenRowStatus((prev) => ({ ...prev, [p.id]: { state: "sending" } })));
      try {
        const res = await fetch("/api/prospects/bulk-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospectIds: targets.map((p) => p.id),
            senderId: selectedSenderId,
            scheduledAt: scheduledIso,
            acknowledgedWarnings: allowWarnings,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || "予約に失敗しました");
          setSendingGenerated(false);
          return;
        }
        const failedList: { id: number; reason: string }[] = Array.isArray(data.failed) ? data.failed : [];
        const failedMap = new Map<number, string>(
          failedList.map((f) => [f.id, f.reason] as [number, string])
        );
        setProspects((prev) =>
          prev.map((x) =>
            targets.some((t) => t.id === x.id) && !failedMap.has(x.id)
              ? { ...x, send_status: "scheduled" }
              : x
          )
        );
        targets.forEach((p) => {
          const reason = failedMap.get(p.id);
          setGenRowStatus((prev) => ({
            ...prev,
            [p.id]: reason ? { state: "failed", error: reason } : { state: "scheduled" },
          }));
        });
        // 失敗分だけ選択に残し、成功は解除（失敗理由を各行で見ながら再操作できる）
        setGeneratedChecked(new Set(failedList.map((f) => f.id)));
        showToast(
          failedList.length
            ? `予約完了: 成功${data.scheduled}件 / 失敗${failedList.length}件（失敗理由は各行に表示）`
            : `${data.scheduled}件を予約しました`
        );
      } catch {
        showToast("予約に失敗しました（通信エラー）");
      }
      setSendingGenerated(false);
      return;
    }

    setSendingGenerated(true);
    let ok = 0;
    let fail = 0;
    for (const p of targets) {
      const email = firstEmailOf(p);
      if (!email) continue;
      setGenRowStatus((prev) => ({ ...prev, [p.id]: { state: "sending" } }));
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospectId: p.id,
            senderId: selectedSenderId,
            toEmail: email,
            acknowledgedWarnings: allowWarnings,
            ...(scheduledIso && { scheduledAt: scheduledIso }),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = Array.isArray(data.reasons)
            ? data.reasons.join(" / ")
            : data.error || "送信に失敗しました";
          setGenRowStatus((prev) => ({ ...prev, [p.id]: { state: "failed", error: msg } }));
          fail++;
        } else if (data.scheduled) {
          setGenRowStatus((prev) => ({ ...prev, [p.id]: { state: "scheduled" } }));
          setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, send_status: "scheduled" } : x)));
          ok++;
        } else {
          setGenRowStatus((prev) => ({ ...prev, [p.id]: { state: "sent" } }));
          setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, send_status: "sent" } : x)));
          ok++;
        }
      } catch {
        setGenRowStatus((prev) => ({ ...prev, [p.id]: { state: "failed", error: "通信エラーが発生しました" } }));
        fail++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    setSendingGenerated(false);
    setGeneratedChecked(new Set());
    showToast(
      isSchedule
        ? (fail === 0 ? `${ok}件を予約しました` : `予約完了: 成功${ok}件 / 失敗${fail}件`)
        : (fail === 0 ? `${ok}件を送信しました` : `送信完了: 成功${ok}件 / 失敗${fail}件`)
    );
  }

  /** 生成メールの内容プレビュー/編集の開閉。開くとき現在の送信本文(subject/body)を下書きに読み込む */
  function toggleGenEdit(p: Prospect) {
    if (genEditingId === p.id) {
      setGenEditingId(null);
      return;
    }
    setGenEditingId(p.id);
    setGenEditSubject(p.subject);
    setGenEditBody(p.body);
  }

  /** 編集した件名・本文を保存（この内容が実際に送信される。/api/prospects/[id] PUT を流用） */
  async function handleSaveGenEdit(p: Prospect) {
    setGenSavingEdit(true);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: genEditSubject, body: genEditBody }),
      });
      if (!res.ok) {
        showToast("保存に失敗しました");
        return;
      }
      setProspects((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, subject: genEditSubject, body: genEditBody } : x))
      );
      setGenEditingId(null);
      showToast("内容を保存しました（この内容で送信されます）");
    } catch {
      showToast("保存に失敗しました（通信エラー）");
    } finally {
      setGenSavingEdit(false);
    }
  }

  return {
    generatedSearch,
    setGeneratedSearch,
    generatedChecked,
    setGeneratedChecked,
    sendingGenerated,
    genRowStatus,
    genScheduledAt,
    setGenScheduledAt,
    genEmailFilter,
    setGenEmailFilter,
    genSendFilter,
    setGenSendFilter,
    genServiceFilter,
    setGenServiceFilter,
    genServiceOptions,
    generatedProspects,
    genSelectable,
    genSelectableIds,
    genRowNote,
    genHiddenCount,
    allGenSelected,
    toggleGenSelectAll,
    genEditingId,
    setGenEditingId,
    toggleGenEdit,
    genEditSubject,
    setGenEditSubject,
    genEditBody,
    setGenEditBody,
    genSavingEdit,
    handleSaveGenEdit,
    handleSendGenerated,
  };
}

export type GeneratedSendApi = ReturnType<typeof useGeneratedSend>;
