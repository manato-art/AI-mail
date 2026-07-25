"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { CompanyWithTag, Contact, Prospect } from "@/lib/types";
import { uid, type Recipient } from "./shared";

/**
 * 「送信履歴から追加」「企業一覧から追加」の状態と処理（page.tsx から移動しただけ）。
 * どちらも既存の宛先とメールアドレスが重複するものは足さない。
 */

interface Options {
  /** 作成日時の降順に並べた prospects */
  sorted: Prospect[];
  serviceNameOf: (id: number) => string;
  recipients: Recipient[];
  setRecipients: Dispatch<SetStateAction<Recipient[]>>;
  showToast: (msg: string) => void;
  /** 上部バーで選んでいる商材。フィルタの初期値にだけ使う（APIには渡さない） */
  activeServiceId: number | null;
  /** 同・商材名（企業一覧は名前で絞り込むため） */
  activeServiceName: string | null;
}

export function useAddRecipients({
  sorted,
  serviceNameOf,
  recipients,
  setRecipients,
  showToast,
  activeServiceId,
  activeServiceName,
}: Options) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  // null = まだ自分で選んでいない（上部バーの商材が初期値になる）
  const [historyServiceFilterState, setHistoryServiceFilter] = useState<string | null>(null);
  const [historyChecked, setHistoryChecked] = useState<Set<number>>(new Set());

  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [companiesList, setCompaniesList] = useState<CompanyWithTag[]>([]);
  const [companiesKeywordFilter, setCompaniesKeywordFilter] = useState("");
  const [companiesServiceFilterState, setCompaniesServiceFilter] = useState<string | null>(null);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [companiesSearch, setCompaniesSearch] = useState("");
  const [companiesChecked, setCompaniesChecked] = useState<Set<number>>(new Set());
  const [companiesLoading, setCompaniesLoading] = useState(false);

  /** 送信履歴に含まれる商材の選択肢（service_id → 名前） */
  const historyServiceOptions = useMemo(() => {
    const ids = new Set<number>();
    for (const p of sorted) if (p.send_status === "sent" && p.emails_found_json) ids.add(p.service_id);
    return [...ids].map((id) => ({ id, name: serviceNameOf(id) || `#${id}` }));
  }, [sorted, serviceNameOf]);

  // 上部バーの商材が選択肢に無いときは「すべての商材」のまま（空の一覧を見せない）
  const historyServiceFilter =
    historyServiceFilterState ??
    (activeServiceId !== null && historyServiceOptions.some((o) => o.id === activeServiceId)
      ? String(activeServiceId)
      : "");

  const sentProspects = useMemo(() => {
    const q = historySearch.toLowerCase();
    return sorted
      .filter((p) => p.send_status === "sent" && p.emails_found_json)
      .filter((p) => !historyServiceFilter || p.service_id === Number(historyServiceFilter))
      .filter((p) =>
        !q ||
        (p.company_name || "").toLowerCase().includes(q) ||
        (p.domain || "").toLowerCase().includes(q) ||
        (p.emails_found_json || "").toLowerCase().includes(q)
      );
  }, [sorted, historySearch, historyServiceFilter]);

  const allHistoryChecked = sentProspects.length > 0 && sentProspects.every((p) => historyChecked.has(p.id));
  function toggleHistoryAll() {
    setHistoryChecked((prev) => {
      const n = new Set(prev);
      if (allHistoryChecked) for (const p of sentProspects) n.delete(p.id);
      else for (const p of sentProspects) n.add(p.id);
      return n;
    });
  }

  function openHistory() {
    setHistoryOpen(true);
    setHistoryChecked(new Set());
    setHistorySearch("");
  }

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
    setCompaniesKeywordFilter("");
    setCompaniesServiceFilter(null);
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

  // どのキーワード・どの商材で集めた企業かを選べるよう、実データから選択肢を作る
  const companyKeywordOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of companiesList) if (c.collection_keyword) set.add(c.collection_keyword);
    return [...set].sort();
  }, [companiesList]);
  const companyServiceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of companiesList) if (c.collection_service_name) set.add(c.collection_service_name);
    return [...set].sort();
  }, [companiesList]);

  // 上部バーの商材が選択肢に無いときは「すべての商材」のまま
  const companiesServiceFilter =
    companiesServiceFilterState ??
    (activeServiceName && companyServiceOptions.includes(activeServiceName) ? activeServiceName : "");

  const filteredCompanies = useMemo(() => {
    let list = companiesList.filter(
      (c) => c.enrichment_status === "done" && (contactsByCompanyId.get(c.id)?.length ?? 0) > 0,
    );
    if (companiesKeywordFilter) list = list.filter((c) => c.collection_keyword === companiesKeywordFilter);
    if (companiesServiceFilter) list = list.filter((c) => c.collection_service_name === companiesServiceFilter);
    if (!companiesSearch) return list;
    const q = companiesSearch.toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.domain ?? "").toLowerCase().includes(q) ||
        (contactsByCompanyId.get(c.id) ?? []).some((ct) => ct.email.toLowerCase().includes(q)),
    );
  }, [companiesList, companiesSearch, contactsByCompanyId, companiesKeywordFilter, companiesServiceFilter]);

  const allCompaniesModalChecked = filteredCompanies.length > 0 && filteredCompanies.every((c) => companiesChecked.has(c.id));
  function toggleCompaniesModalAll() {
    setCompaniesChecked((prev) => {
      const n = new Set(prev);
      if (allCompaniesModalChecked) for (const c of filteredCompanies) n.delete(c.id);
      else for (const c of filteredCompanies) n.add(c.id);
      return n;
    });
  }

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

  return {
    // 送信履歴から追加
    historyOpen,
    openHistory,
    closeHistory: () => setHistoryOpen(false),
    historySearch,
    setHistorySearch,
    historyServiceFilter,
    setHistoryServiceFilter,
    historyServiceOptions,
    historyChecked,
    setHistoryChecked,
    sentProspects,
    allHistoryChecked,
    toggleHistoryAll,
    handleHistoryImport,
    // 企業一覧から追加
    companiesOpen,
    openCompaniesModal,
    closeCompanies: () => setCompaniesOpen(false),
    companiesSearch,
    setCompaniesSearch,
    companiesKeywordFilter,
    setCompaniesKeywordFilter,
    companiesServiceFilter,
    setCompaniesServiceFilter,
    companyKeywordOptions,
    companyServiceOptions,
    companiesLoading,
    filteredCompanies,
    contactsByCompanyId,
    companiesChecked,
    setCompaniesChecked,
    allCompaniesModalChecked,
    toggleCompaniesModalAll,
    handleCompaniesImport,
  };
}

export type AddRecipientsApi = ReturnType<typeof useAddRecipients>;
