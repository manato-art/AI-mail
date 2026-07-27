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
  setSetting,
  upsertContact,
} from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { analyzeCompany } from "@/lib/analyze";
import { companyNameAppearsOnSite } from "@/lib/data-integrity";
import { crawlKnownHomepage, resolveCompanyHomepage, type ResolvedCompany } from "@/lib/company-resolve";
import { resolveHomepageFromListing } from "@/lib/listing-resolve";
import { SearchBlockedError, SearchConfigError, extractContactName } from "@/lib/keyword-search";
import { describeErrorKind, isInfrastructureErrorKind } from "@/lib/enrichment-errors";
import type { Company, EnrichmentErrorKind, FitScore, Service } from "@/lib/types";

/** 1サイクルで裏処理する件数。1社あたり検索1回＋クロール＋AI2回かかるので少しずつ進める */
const ENRICH_BATCH_SIZE = 10;
const ENRICH_DELAY_BASE_MS = 2000;
const ENRICH_DELAY_JITTER_MS = 3000;

/**
 * 同じ理由の失敗がこの回数続いたらバッチを打ち切る。
 * 単発の失敗では止めない（1社が一時的にコケただけで正常なバッチを止めないため）。
 */
const CONSECUTIVE_FAILURE_LIMIT = 3;

/**
 * 基盤起因（検索ブロック・設定不足）を検知したときに、自動の調査見回りを止める時間。
 * 収集側の pauseCollectionSource に相当する停止シグナルで、
 * 解除は画面の「やり直す」（/api/companies/retry-failed）から行う。
 */
const ENRICHMENT_PAUSE_MINUTES = 30;

/** 調査の自動見回りを止める期限（ISO風のローカル時刻文字列）。設定が空なら停止していない */
export const ENRICHMENT_PAUSED_UNTIL_KEY = "enrichment_paused_until";

function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 自動の調査見回りを一定時間止める。手動実行（画面のボタン）はこの停止を見ない */
export function pauseEnrichment(minutes: number = ENRICHMENT_PAUSE_MINUTES): string {
  const until = formatLocalDateTime(new Date(Date.now() + minutes * 60 * 1000));
  setSetting(ENRICHMENT_PAUSED_UNTIL_KEY, until);
  return until;
}

/** 停止を解除する（画面の「やり直す」導線から呼ぶ手動リセット） */
export function resumeEnrichment(): void {
  setSetting(ENRICHMENT_PAUSED_UNTIL_KEY, "");
}

/** いま自動の調査見回りを止めているか。止めているなら解除予定時刻を返す */
export function getEnrichmentPausedUntil(): string | null {
  const raw = (getSetting(ENRICHMENT_PAUSED_UNTIL_KEY) || "").trim();
  if (!raw) return null;
  const until = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(until.getTime())) return null;
  return until.getTime() > Date.now() ? raw : null;
}

/**
 * 例外を「原因の種類」に落とす。
 * ここで基盤起因（search_blocked / config_missing）と企業固有を分けられないと、
 * 障害1件が数百社分の「調査できず」として記録され続ける。
 */
export function classifyEnrichmentError(error: unknown): EnrichmentErrorKind {
  if (error instanceof SearchBlockedError) return "search_blocked";
  if (error instanceof SearchConfigError) return "config_missing";
  return "unknown";
}

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

interface EnrichResult {
  outcome: EnrichOutcome;
  /** failed のときの分類。打ち切り判定（同一理由の連続）に使う */
  errorKind?: EnrichmentErrorKind;
}

/**
 * 公式サイトを次の順に特定する。手前で決まれば後ろは呼ばない。
 *   ① 既知のHP（hp_url）        … 収集済みの正準情報。検索も媒体アクセスも不要
 *   ② 掲載URL（listing_url）から … 媒体の企業ページから公式サイトURLを直接読む（検索なし）
 *   ③ 社名で検索                 … 上2つが無い/取れなかった時だけのフォールバック
 *
 * ①②は「手元にある正準キー」を使うので、検索が壊れていても進められ、
 * 同名の別会社を掴む誤りも起きない（KB: entity-name-match-unreliable-use-canonical-key）。
 */
async function resolveCompanySite(company: Company): Promise<ResolvedCompany | null> {
  const knownHpUrl = (company.hp_url ?? "").trim();
  if (knownHpUrl) {
    logActivity(`🔁 ${company.name}: 既知のHPから再開します（検索はしません）`);
    return crawlKnownHomepage(knownHpUrl);
  }

  const listingUrl = (company.listing_url ?? "").trim();
  if (listingUrl) {
    logActivity(`🔗 ${company.name}: 掲載ページから公式サイトを特定します（検索はしません）`);
    const fromListing = await resolveHomepageFromListing(listingUrl);
    if (fromListing) return fromListing;
    logActivity(
      `↩️ ${company.name}: 掲載ページから公式サイトを特定できず、社名検索に切り替えます`,
      "warn"
    );
  }

  logActivity(`🔍 ${company.name} の公式サイトを検索中...`);
  return resolveCompanyHomepage(company.name, "");
}

async function enrichCompany(
  company: Company,
  service: Service | null
): Promise<EnrichResult> {
  const knownHpUrl = (company.hp_url ?? "").trim();
  const resolved = await resolveCompanySite(company);

  if (!resolved) {
    // 「見つからなかった」のか「分かっているのに読めなかった」のかを混ぜない
    const kind: EnrichmentErrorKind = knownHpUrl ? "crawl_empty" : "hp_not_found";
    const message = knownHpUrl
      ? `登録済みのHP（${knownHpUrl}）を読み取れませんでした`
      : "公式サイトを特定できませんでした";
    logActivity(`❌ ${company.name}: ${message}`, "error");
    markCompanyEnrichmentFailed(company.id, message, kind);
    return { outcome: "failed", errorKind: kind };
  }

  logActivity(`🌐 ${company.name} → ${resolved.domain}`);

  // 収集時は企業名しか無いため、ドメインが分かったこの時点で重複・抑止・送信済みを照合する
  const exclusion = findExclusionReason(company, resolved.domain);
  if (exclusion) {
    logActivity(`⏭️ ${company.name}: ${exclusion}`, "warn");
    markCompanyExcluded(company.id, exclusion);
    return { outcome: "excluded" };
  }
  setCompanyDomain(company.id, resolved.domain);

  if (resolved.crawl.pages.length === 0) {
    logActivity(`❌ ${company.name}: ページ内容を取得できず`, "error");
    markCompanyEnrichmentFailed(
      company.id,
      "公式サイトの内容を取得できませんでした",
      "crawl_empty"
    );
    return { outcome: "failed", errorKind: "crawl_empty" };
  }

  logActivity(`📄 ${company.name}: ${resolved.crawl.pages.length}ページをクロール済み`);

  // リストアップ時点の整合チェック（最初から誤紐付けを入れない）。
  // 収集時の社名検索が別会社の公式を上位に返すことがあるため、自社名がHPのどこにも現れなければ
  // 誤紐付けの疑いとして連絡先を保存せず failed にする（誤メアドを在庫に入れない）。
  // 判定は保守的（NFKC吸収・拠点後置語救済・本文が薄い/短い社名は"消さない側")なので、
  // 正常企業を過剰に弾かない。弾かれた企業は failed で残り、再調査で戻せる。
  // 掲載元から正式社名が分かっている場合は照合候補に加える（媒体表記と正式社名のズレで
  // 正しい企業を「別会社の疑い」として弾かないため）。判定の厳しさ自体は変えていない
  const legalName = (resolved.legalName ?? "").trim();
  if (!companyNameAppearsOnSite(company.name, resolved.crawl.pages, legalName ? [legalName] : [])) {
    logActivity(`❌ ${company.name}: HPに社名が見当たらず別会社の疑い（${resolved.domain}）`, "error");
    markCompanyEnrichmentFailed(
      company.id,
      `社名「${company.name}」がHP（${resolved.domain}）に見当たりません（別会社サイトの誤検出の疑い・要確認）`,
      "name_mismatch"
    );
    return { outcome: "failed", errorKind: "name_mismatch" };
  }

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

  // フォームURLは「メールが取れない企業に人が連絡する」ための唯一の手段になることが多い。
  // 保存先が無く捨てていたぶん、連絡可能な企業が実態より大幅に少なく見えていた（自動送信はしない）
  const formUrl = resolved.crawl.formUrl;

  if (!service) {
    markCompanyEnriched(company.id, {
      hp_url: resolved.homepage,
      recruit_page_url: resolved.crawl.recruitPageUrl,
      form_url: formUrl,
    });
    logActivity(`✅ ${company.name}: 調査完了`, "success");
    return { outcome: "done" };
  }

  logActivity(`🤖 ${company.name}: AI分析中...`);
  let analysis;
  try {
    analysis = await analyzeCompany(resolved.crawl, service);
  } catch (error) {
    // AI分析がコケただけで、取得済みの連絡先・HP・フォームまで巻き戻さない。
    // 相性スコアは空のままにして「未評価」と分かるようにする
    const message = error instanceof Error ? error.message : "AI分析に失敗しました";
    logActivity(`⚠️ ${company.name}: AI分析に失敗（連絡先は保持）: ${message}`, "warn");
    markCompanyEnriched(company.id, {
      hp_url: resolved.homepage,
      recruit_page_url: resolved.crawl.recruitPageUrl,
      form_url: formUrl,
      enrichment_error: `AI分析に失敗しました: ${message}`,
      error_kind: "analyze_failed",
    });
    return { outcome: "done" };
  }

  markCompanyEnriched(company.id, {
    hp_url: resolved.homepage,
    recruit_page_url: resolved.crawl.recruitPageUrl,
    form_url: formUrl,
    business_summary: analysis.business_summary ?? "",
    fit_score: normalizeFitScore(analysis.compatibility?.score),
    fit_reason: analysis.compatibility?.reason ?? "",
    fit_service_id: service.id,
    analysis_json: JSON.stringify(analysis),
  });
  logActivity(`✅ ${company.name}: 調査完了（相性: ${analysis.compatibility?.score ?? "—"}）`, "success");
  return { outcome: "done" };
}

export interface EnrichmentBatchResult {
  processed: number;
  failed: number;
  excluded: number;
  /** 回路遮断で残した未処理件数（pending のまま。0なら最後まで回した） */
  stoppedRemaining?: number;
  /** 打ち切りの理由分類（打ち切っていなければ undefined） */
  stoppedKind?: EnrichmentErrorKind;
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

  // 同じ理由で失敗し続けるなら、それは企業ごとの事情ではなく共通の障害。
  // 気づかないまま5分おきに20社ずつ焼き切るのを止めるための打ち切り判定に使う
  let lastKind: EnrichmentErrorKind | null = null;
  let sameKindStreak = 0;
  let stoppedKind: EnrichmentErrorKind | undefined;
  let stoppedRemaining = 0;

  for (const [index, company] of companies.entries()) {
    if (index > 0) await sleep(nextDelay());

    logActivity(`— [${index + 1}/${companies.length}] ${company.name}`);

    let kind: EnrichmentErrorKind | undefined;
    try {
      const result = await enrichCompany(company, service);
      tally[result.outcome] += 1;
      kind = result.errorKind;
    } catch (error) {
      const message = error instanceof Error ? error.message : "裏処理に失敗しました";
      kind = classifyEnrichmentError(error);
      console.error("enrichment failed:", company.name, message, `(${kind})`);
      logActivity(`💥 ${company.name}: ${message}`, "error");
      markCompanyEnrichmentFailed(company.id, message, kind);
      tally.failed += 1;
    }

    if (!kind) {
      lastKind = null;
      sameKindStreak = 0;
      continue;
    }

    sameKindStreak = kind === lastKind ? sameKindStreak + 1 : 1;
    lastKind = kind;

    // 基盤起因は1件でも即打ち切り（残りは pending のまま復旧後に自動再開する）。
    // 企業固有でも同じ理由が続くなら共通原因を疑って一旦止める（単発では止めない）。
    const infrastructure = isInfrastructureErrorKind(kind);
    if (infrastructure || sameKindStreak >= CONSECUTIVE_FAILURE_LIMIT) {
      stoppedKind = kind;
      stoppedRemaining = companies.length - (index + 1);
      break;
    }
  }

  if (stoppedKind) {
    // 1社ずつ×印を並べるのではなく、集約した1行で「基盤が止まっている」と伝える
    const paused = isInfrastructureErrorKind(stoppedKind) ? pauseEnrichment() : null;
    logActivity(
      `⛔ 調査を中断しました（${describeErrorKind(stoppedKind)}）。` +
        `残り${stoppedRemaining}社は未処理のまま残しています` +
        (paused ? `。${paused} まで自動調査を止めます（画面の「やり直す」で再開できます）` : ""),
      "error"
    );
  }

  logActivity(
    `🏁 調査完了: 成功${tally.done} / 除外${tally.excluded} / 失敗${tally.failed}`,
    tally.failed > 0 ? "warn" : "success"
  );
  return {
    processed: tally.done,
    failed: tally.failed,
    excluded: tally.excluded,
    stoppedRemaining,
    stoppedKind,
  };
}
