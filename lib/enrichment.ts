import {
  findCompanyByDomain,
  getAllServices,
  getCompaniesPendingEnrichment,
  getSetting,
  hasSentToDomain,
  isDomainSuppressed,
  isEmailSuppressed,
  markCompanyEnrichmentFailed,
  markCompanyEnriched,
  markCompanyExcluded,
  setCompanyDomain,
  upsertContact,
} from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { analyzeCompany } from "@/lib/analyze";
import { resolveCompanyHomepage } from "@/lib/company-resolve";
import { extractContactName } from "@/lib/keyword-search";
import type { Company, FitScore, Service } from "@/lib/types";

/** 1サイクルで裏処理する件数。1社あたり検索1回＋クロール＋AI2回かかるので少しずつ進める */
const ENRICH_BATCH_SIZE = 10;
const ENRICH_DELAY_BASE_MS = 2000;
const ENRICH_DELAY_JITTER_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(): number {
  return ENRICH_DELAY_BASE_MS + Math.floor(Math.random() * ENRICH_DELAY_JITTER_MS);
}

/**
 * 相性スコアを付ける対象の商材。
 * 明示設定が無ければ最初の1件を使う。商材が1つも無ければスコアリングは行わない
 * （スコアが付かないだけで、連絡先の収集は成立するのでエラーにはしない）。
 */
function resolveScoringService(): Service | null {
  const services = getAllServices();
  if (services.length === 0) return null;

  const configuredId = Number(getSetting("enrichment_service_id") || 0);
  const configured = services.find((s) => s.id === configuredId);
  return configured ?? services[0];
}

/** 収集済みだが送ってはいけない相手を在庫から外す。理由は必ず残す */
function findExclusionReason(company: Company, domain: string): string | null {
  const duplicate = findCompanyByDomain(domain);
  if (duplicate && duplicate.id !== company.id) {
    return `同じドメイン（${domain}）の企業が既に登録されています`;
  }
  if (isDomainSuppressed(domain)) {
    return `抑止リストに登録されたドメインです（${domain}）`;
  }
  if (hasSentToDomain(domain)) {
    return `このドメインには既に送信済みです（${domain}）`;
  }
  return null;
}

function normalizeFitScore(value: unknown): FitScore {
  return value === "high" || value === "medium" || value === "low" ? value : "";
}

type EnrichOutcome = "done" | "excluded" | "failed";

async function enrichCompany(
  company: Company,
  service: Service | null
): Promise<EnrichOutcome> {
  logActivity(`🔍 ${company.name} の公式サイトを検索中...`);
  const resolved = await resolveCompanyHomepage(company.name, "");
  if (!resolved) {
    logActivity(`❌ ${company.name}: 公式サイトを特定できず`, "error");
    markCompanyEnrichmentFailed(company.id, "公式サイトを特定できませんでした");
    return "failed";
  }

  logActivity(`🌐 ${company.name} → ${resolved.domain}`);

  // 収集時は企業名しか無いため、ドメインが分かったこの時点で重複・抑止・送信済みを照合する
  const exclusion = findExclusionReason(company, resolved.domain);
  if (exclusion) {
    logActivity(`⏭️ ${company.name}: ${exclusion}`, "warn");
    markCompanyExcluded(company.id, exclusion);
    return "excluded";
  }
  setCompanyDomain(company.id, resolved.domain);

  if (resolved.crawl.pages.length === 0) {
    logActivity(`❌ ${company.name}: ページ内容を取得できず`, "error");
    markCompanyEnrichmentFailed(company.id, "公式サイトの内容を取得できませんでした");
    return "failed";
  }

  logActivity(`📄 ${company.name}: ${resolved.crawl.pages.length}ページをクロール済み`);

  const email = resolved.crawl.contactEmails[0] ?? null;
  if (email && !isEmailSuppressed(email)) {
    logActivity(`✉️ ${company.name}: メールアドレス発見 → ${email}`, "success");
    const personName = await extractContactName(company.name, resolved.crawl.pages);
    upsertContact({
      company_id: company.id,
      company_name: company.name,
      person_name: personName ?? "",
      email,
      email_source_url: resolved.homepage,
      source: "auto_collection",
      lp_url: null,
      notes: "",
    });
  } else if (email) {
    logActivity(`⏭️ ${company.name}: ${email} は抑止リストに該当`, "warn");
  } else {
    logActivity(`⚠️ ${company.name}: メールアドレスが見つからず`, "warn");
  }

  if (!service) {
    markCompanyEnriched(company.id, {
      hp_url: resolved.homepage,
      recruit_page_url: resolved.crawl.recruitPageUrl,
    });
    logActivity(`✅ ${company.name}: 調査完了`, "success");
    return "done";
  }

  logActivity(`🤖 ${company.name}: AI分析中...`);
  const analysis = await analyzeCompany(resolved.crawl, service);
  markCompanyEnriched(company.id, {
    hp_url: resolved.homepage,
    recruit_page_url: resolved.crawl.recruitPageUrl,
    business_summary: analysis.business_summary ?? "",
    fit_score: normalizeFitScore(analysis.compatibility?.score),
    fit_reason: analysis.compatibility?.reason ?? "",
    fit_service_id: service.id,
    analysis_json: JSON.stringify(analysis),
  });
  logActivity(`✅ ${company.name}: 調査完了（相性: ${analysis.compatibility?.score ?? "—"}）`, "success");
  return "done";
}

export interface EnrichmentBatchResult {
  processed: number;
  failed: number;
  excluded: number;
}

/**
 * 収集済みで未処理の企業を、送れる状態（連絡先＋相性スコア）まで進める。
 * 収集と同じく順番に処理する。並列にすると相手サイトへ同時アクセスすることになる。
 */
export async function runEnrichmentBatch(
  limit: number = ENRICH_BATCH_SIZE
): Promise<EnrichmentBatchResult> {
  const companies = getCompaniesPendingEnrichment(limit);
  const service = resolveScoringService();
  const tally: Record<EnrichOutcome, number> = { done: 0, excluded: 0, failed: 0 };

  if (companies.length === 0) {
    logActivity("調査待ちの企業はありません");
    return { processed: 0, failed: 0, excluded: 0 };
  }

  logActivity(`📋 ${companies.length}社の調査を開始します`);

  for (const [index, company] of companies.entries()) {
    if (index > 0) await sleep(nextDelay());

    logActivity(`— [${index + 1}/${companies.length}] ${company.name}`);
    try {
      tally[await enrichCompany(company, service)] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "裏処理に失敗しました";
      console.error("enrichment failed:", company.name, message);
      logActivity(`💥 ${company.name}: ${message}`, "error");
      markCompanyEnrichmentFailed(company.id, message);
      tally.failed += 1;
    }
  }

  logActivity(
    `🏁 調査完了: 成功${tally.done} / 除外${tally.excluded} / 失敗${tally.failed}`,
    tally.failed > 0 ? "warn" : "success"
  );
  return { processed: tally.done, failed: tally.failed, excluded: tally.excluded };
}
