/**
 * 店パック取込（かってにHP・継ぎ目②）— 2026-08-08 M2 設計 P1-1。
 *
 * 店舗LP側（ローカル）で人が検証した調査結果一式（店パックJSON）を、
 * 認証の内側（ブラウザからの取込）で本番DBへ反映する。
 * 外部に書き込みAPIを開けないための設計（proxy.ts の認証が前提）。
 *
 * ★ この取込が守る不変条件（検証ワークフローの CRITICAL 対応）:
 *   V1: 同一ドメイン複数店舗（実例: sanwa-gr.com にそば屋＋不動産＋CATV）で
 *       company が1行に潰れない。place_id があればそれを最優先で同定し、
 *       **別の店の分析が入っている行への上書きはエラーにして人に見せる**。
 *   V2: 取込んだ分析は analysis_source='lp'。自動enrichmentは二度と触らない。
 *       必ず enrichment_status='done' で入れる（pending に残すと定期ジョブが
 *       Web検索由来の分析で静かに置き換える）。
 *   DT-5: email_refusal_notice=true の店は宛先を作らず抑止リストへ。
 */
import {
  addSuppression,
  getCompanyByPlaceId,
  markCompanyEnriched,
  setCompanyPlaceId,
  setContactLpUrl,
  upsertCompany,
  upsertContact,
} from "@/lib/db";
import type { AnalysisResult } from "@/lib/types";

export interface StorePack {
  company_name?: unknown;
  email?: unknown;
  email_source_url?: unknown;
  email_refusal_notice?: unknown;
  hp_url?: unknown;
  lp_url?: unknown;
  place_id?: unknown;
  analysis?: unknown;
}

export interface HandoffResult {
  ok: boolean;
  outcome:
    | "imported"
    | "suppressed"
    | "invalid"
    | "conflict";
  detail: string;
  company_id?: number;
  contact_id?: number;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 分析データの最低限の形。空の器を入れると parseAnalysisJson が null 扱いにして
 * **黙って再クロールに戻る**（「入れたのに効いていない」が起きる）ので、ここで弾く。
 */
function checkAnalysis(value: unknown): { ok: true; json: string } | { ok: false; why: string } {
  if (typeof value !== "object" || value === null) return { ok: false, why: "analysis が object ではない" };
  const a = value as Partial<AnalysisResult>;
  if (!a.company_name?.trim()) return { ok: false, why: "analysis.company_name が空" };
  if (!a.business_summary?.trim()) return { ok: false, why: "analysis.business_summary が空" };
  if (!a.hook?.trim()) return { ok: false, why: "analysis.hook が空（AI生成の足場になるので必須）" };
  const json = JSON.stringify(value);
  if (json.length > 200_000) return { ok: false, why: `analysis が大きすぎる（${json.length}バイト）` };
  return { ok: true, json };
}

export function importStorePack(pack: StorePack): HandoffResult {
  const name = str(pack.company_name);
  const email = str(pack.email).toLowerCase();
  const hpUrl = str(pack.hp_url);
  const lpUrl = str(pack.lp_url);
  const placeId = str(pack.place_id) || null;

  if (!name) return { ok: false, outcome: "invalid", detail: "company_name が空です" };
  if (!hpUrl) return { ok: false, outcome: "invalid", detail: "hp_url が空です（グループのトップではなく店のページを入れる）" };

  // ── DT-5: 営業お断りが検出された店は、宛先を作らず抑止リストへ ──
  if (pack.email_refusal_notice === true) {
    if (!email) return { ok: false, outcome: "invalid", detail: "refusal 指定なのに email が空です" };
    addSuppression({
      target: email,
      target_type: "email",
      reason: "refusal_detected",
      note: `店パック取込: ${name} のアドレス掲載箇所に営業お断りの記載（出所: ${str(pack.email_source_url) || "不明"}）`,
    });
    return { ok: true, outcome: "suppressed", detail: `営業お断りのため抑止リストに登録: ${email}` };
  }

  if (!email) return { ok: false, outcome: "invalid", detail: "email が空です（宛先は推測しない）" };
  if (!/^https:\/\//.test(lpUrl)) return { ok: false, outcome: "invalid", detail: "lp_url は https のURLが必要です" };

  const analysis = checkAnalysis(pack.analysis);
  if (!analysis.ok) return { ok: false, outcome: "invalid", detail: analysis.why };

  // ── 企業の同定。place_id 最優先（V1: ドメイン照合は同一グループで潰れる） ──
  let company = placeId ? getCompanyByPlaceId(placeId) : undefined;
  if (!company) {
    // domain は使わない。email のドメインはグループ共有でありうる（sanwa-gr.com の実例）。
    // 名前で upsert し、place_id があれば行に刻んで以後の同定キーにする
    company = upsertCompany({ name, domain: null, source: "manual", source_detail: "かってにHP 店パック取込", hp_url: hpUrl });

    // ★ 既存行の乗っ取り検査（V1）: 拾った行に「別の店」のLP由来分析が既に入っていたら止める。
    //   黙って上書きすると、店Aのメールに店Bの紹介文が混入する（高美亭の事故と同型）
    if (company.analysis_source === "lp") {
      let existing: Partial<AnalysisResult> = {};
      try { existing = JSON.parse(company.analysis_json); } catch { /* 壊れていれば空扱い */ }
      const samePlace = placeId && company.place_id ? company.place_id === placeId : false;
      const sameName = (existing.company_name ?? "") === name;
      if (!samePlace && !sameName) {
        return {
          ok: false,
          outcome: "conflict",
          detail: `company #${company.id} には別の店のLP由来分析（${existing.company_name ?? "不明"}）が入っています。place_id を付けて別店として取り込んでください`,
        };
      }
    }
    if (placeId && !company.place_id) setCompanyPlaceId(company.id, placeId);
  }

  // ── 分析・HP・状態を一括反映（V2: 必ず done + analysis_source='lp'） ──
  markCompanyEnriched(company.id, {
    hp_url: hpUrl,
    analysis_json: analysis.json,
    analysis_source: "lp",
  });

  // ── 宛先。upsert は既存に触らないので、lp_url は明示更新で必ず入れる ──
  const contact = upsertContact({
    company_id: company.id,
    company_name: name,
    person_name: "",
    email,
    email_source_url: str(pack.email_source_url) || hpUrl,
    source: "manual",
    lp_url: lpUrl,
  });
  const lpOutcome = setContactLpUrl(email, lpUrl);
  if (lpOutcome === "not_found") {
    return { ok: false, outcome: "invalid", detail: `連絡先の作成に失敗しました: ${email}` };
  }

  return {
    ok: true,
    outcome: "imported",
    detail: `${name} を取込（分析=LP正データ・URL=${lpUrl}）`,
    company_id: company.id,
    contact_id: contact.id,
  };
}
