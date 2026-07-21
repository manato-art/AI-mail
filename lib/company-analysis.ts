/**
 * 一括送信の{{AI:...}}ゾーン用: 宛先企業の分析データを解決する。
 *
 * 探索順:
 *   1. 連絡先 → 企業ID → companies.analysis_json
 *   2. 企業名で companies テーブルを検索
 *   3. メールドメインで companies テーブルを検索
 *   4. 公式サイトを検索→クロール→Gemini分析（結果はキャッシュ）
 *
 * 4 は初回10〜20秒かかるが、結果を companies テーブルに保存するため
 * 同じ企業への2回目以降は 1〜3 で即時解決される。
 */

import {
  getContactByEmail,
  getCompanyById,
  findCompanyByName,
  findCompanyByDomain,
  upsertCompany,
  markCompanyEnriched,
} from "@/lib/db";
import { resolveCompanyHomepage } from "@/lib/company-resolve";
import { analyzeCompany } from "@/lib/analyze";
import type { AnalysisResult, FitScore, Service } from "@/lib/types";

function normalizeFitScore(value: unknown): FitScore {
  return value === "high" || value === "medium" || value === "low" ? value : "";
}

function parseAnalysisJson(json: string | undefined | null): AnalysisResult | null {
  if (!json || json === "{}" || json === "null") return null;
  try {
    const parsed = JSON.parse(json) as AnalysisResult;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.company_name && !parsed.business_summary) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function resolveAnalysisForRecipient(
  companyName: string,
  email: string,
  service: Service
): Promise<AnalysisResult | null> {
  // --- 1. 連絡先 → 企業の分析データ ---
  const contact = getContactByEmail(email);
  if (contact?.company_id) {
    const comp = getCompanyById(contact.company_id);
    const analysis = parseAnalysisJson(comp?.analysis_json);
    if (analysis) return analysis;
  }

  // --- 2. 企業名で検索 ---
  if (companyName) {
    const comp = findCompanyByName(companyName);
    const analysis = parseAnalysisJson(comp?.analysis_json);
    if (analysis) return analysis;
  }

  // --- 3. メールドメインで検索 ---
  const emailDomain = email.split("@")[1]?.toLowerCase();
  if (emailDomain) {
    const comp = findCompanyByDomain(emailDomain);
    const analysis = parseAnalysisJson(comp?.analysis_json);
    if (analysis) return analysis;
  }

  // --- 4. オンデマンド: 公式サイト検索→クロール→分析 ---
  if (!companyName) return null;

  const resolved = await resolveCompanyHomepage(companyName, "");
  if (!resolved || resolved.crawl.pages.length === 0) return null;

  const analysis = await analyzeCompany(resolved.crawl, service);

  const company = upsertCompany({
    name: companyName,
    domain: resolved.domain,
    source: "bulk_send",
    source_detail: "AIゾーン解決時に自動取得",
    hp_url: resolved.homepage,
  });

  markCompanyEnriched(company.id, {
    hp_url: resolved.homepage,
    recruit_page_url: resolved.crawl.recruitPageUrl,
    business_summary: analysis.business_summary ?? "",
    fit_score: normalizeFitScore(analysis.compatibility?.score),
    fit_reason: analysis.compatibility?.reason ?? "",
    fit_service_id: service.id,
    analysis_json: JSON.stringify(analysis),
  });

  return analysis;
}
