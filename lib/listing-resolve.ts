import * as cheerio from "cheerio";
import { logActivity } from "@/lib/activity-log";
import {
  crawlKnownHomepage,
  isExcludedHomepageDomain,
  type ResolvedCompany,
} from "@/lib/company-resolve";
import {
  companySlugFromUrl,
  fetchWantedlyPage,
  findCompanyPageUrl,
  isWantedlyUrl,
  toCompanyPageUrl,
} from "@/lib/wantedly-scraper";
import { validateUrl } from "@/lib/ssrf";

/**
 * 収集時に手元にある「掲載ページURL」から、検索を一切使わずに公式サイトを特定する。
 *
 * 社名で検索し直す方式は、検索が止まると掲載URLを持っている企業まで巻き添えで失敗し、
 * さらに同名・類似名の別会社を掴む危険がある（KB: entity-name-match-unreliable-use-canonical-key）。
 * 掲載URLは収集時点で確定している正準キーなので、こちらを先に使う。
 */

/** 掲載ページから読み取れた公式サイト情報 */
export interface ListingOfficialSite {
  /** 企業の公式サイトURL（媒体・SNS・求人サイトではないことを検証済み） */
  url: string;
  /** 正式社名（JSON-LD の legalName / name）。取れなければ空文字 */
  legalName: string;
}

type JsonLdNode = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** JSON-LD は単体・配列・@graph のどれでも来るので、ノードの平坦な一覧にする */
function flattenJsonLd(parsed: unknown): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const entry of asArray(parsed)) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as JsonLdNode;
    nodes.push(node);
    if ("@graph" in node) {
      for (const child of asArray(node["@graph"])) {
        if (child && typeof child === "object") nodes.push(child as JsonLdNode);
      }
    }
  }
  return nodes;
}

function isOrganizationNode(node: JsonLdNode): boolean {
  return asArray(node["@type"]).some((t) => asString(t) === "Organization");
}

/**
 * 当該企業の Organization ノードだけを選ぶ。
 *
 * 媒体の企業ページには「媒体運営会社」のOrganizationも同居しており（@id が媒体トップ）、
 * 素朴に最初の1件を採ると全企業が媒体運営会社の公式サイトに紐づく。
 * @id が `/companies/{slug}` を含むノードだけを当該企業とみなす。
 */
function selectCompanyOrganization(nodes: JsonLdNode[], companySlug: string): JsonLdNode | null {
  const marker = companySlug ? `/companies/${companySlug}` : "/companies/";
  for (const node of nodes) {
    if (!isOrganizationNode(node)) continue;
    if (asString(node["@id"]).includes(marker)) return node;
  }
  return null;
}

/**
 * Organization ノードから公式サイトの候補URLを列挙する。
 * `url` は媒体側の自社ページ（自己参照）を指すため使わない。
 */
function collectSiteCandidates(node: JsonLdNode): string[] {
  const candidates: string[] = [];
  for (const point of asArray(node["contactPoint"])) {
    if (!point || typeof point !== "object") continue;
    const url = asString((point as JsonLdNode)["url"]);
    if (url) candidates.push(url);
  }
  for (const sameAs of asArray(node["sameAs"])) {
    const url = asString(sameAs);
    if (url) candidates.push(url);
  }
  return candidates;
}

/** 媒体・SNS・求人サイトを除いた最初の候補を返す */
function pickOfficialUrl(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const validated = validateUrl(candidate);
    if (!validated.valid) continue;
    if (isWantedlyUrl(validated.normalized)) continue;
    if (isExcludedHomepageDomain(validated.normalized)) continue;
    return validated.normalized;
  }
  return null;
}

/**
 * 企業ページのHTML（JSON-LD）から公式サイトURLと正式社名を取り出す。
 * JSON-LDが無い・当該企業のOrganizationが無い・公式URLが取れない場合は null（例外にしない）。
 */
export function extractOfficialSiteFromJsonLd(
  html: string,
  companySlug: string
): ListingOfficialSite | null {
  const $ = cheerio.load(html);

  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text().trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 壊れたJSON-LDは無視して次のブロックを見る（ページ全体を捨てない）
      continue;
    }

    const organization = selectCompanyOrganization(flattenJsonLd(parsed), companySlug);
    if (!organization) continue;

    const url = pickOfficialUrl(collectSiteCandidates(organization));
    if (!url) continue;

    return {
      url,
      legalName: asString(organization["legalName"]) || asString(organization["name"]),
    };
  }

  return null;
}

/**
 * Wantedlyの掲載URLから公式サイトを特定してクロールする。
 * 媒体へのアクセスは1社あたり最大2回（企業ページ1＋募集ページから企業ページを辿る場合の1）。
 */
async function resolveFromWantedly(listingUrl: string): Promise<ResolvedCompany | null> {
  let companyPageUrl = toCompanyPageUrl(listingUrl);

  if (!companyPageUrl) {
    // 募集ページ（/projects/{id}）しか無い場合だけ、企業ページを1回辿る
    const listingHtml = await fetchWantedlyPage(listingUrl);
    if (!listingHtml) return null;
    companyPageUrl = findCompanyPageUrl(listingHtml);
    if (!companyPageUrl) return null;
  }

  const companyHtml = await fetchWantedlyPage(companyPageUrl);
  if (!companyHtml) return null;

  const official = extractOfficialSiteFromJsonLd(
    companyHtml,
    companySlugFromUrl(companyPageUrl)
  );
  if (!official) return null;

  let origin: string;
  try {
    origin = new URL(official.url).origin;
  } catch {
    return null;
  }

  logActivity(`🔗 掲載ページから公式サイトを特定: ${origin}`);
  const resolved = await crawlKnownHomepage(origin, "掲載ページ由来・検索なし");
  if (!resolved) return null;

  return { ...resolved, legalName: official.legalName };
}

/**
 * 収集時に保存した掲載URLから公式サイトを特定する。特定できなければ null
 * （呼び出し元は従来どおり社名検索にフォールバックする）。
 *
 * 掲載URLのホストが求人媒体・SNSの場合、そのドメイン自体は公式サイトではないので採用しない。
 * Wantedlyだけは企業ページのJSON-LDから公式サイトURLを直接読めるため、専用の経路を通す。
 */
export async function resolveHomepageFromListing(
  listingUrl: string
): Promise<ResolvedCompany | null> {
  // 保存済みのURLでもそのまま叩かずSSRF検証を通す（DBが書き換わっている可能性を想定する）
  const validated = validateUrl(listingUrl);
  if (!validated.valid) return null;

  if (isWantedlyUrl(validated.normalized)) {
    return resolveFromWantedly(validated.normalized);
  }

  // 掲載URLのホストは媒体（site:検索の対象サイト）そのものなので、企業の公式サイトではない。
  // 除外ドメインでなくても媒体トップをクロールしてしまうため、ここでは採用しない
  return null;
}
