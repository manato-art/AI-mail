import { getSetting } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { SearchConfigError, webSearch } from "@/lib/keyword-search";
import { scrapeSearch } from "@/lib/keyword-search-scrape";
import { crawlWebsite } from "@/lib/crawl";
import { validateUrl } from "@/lib/ssrf";
import type { CrawlResult } from "@/lib/types";

/**
 * 企業の「公式サイト」を探す時に拾ってはいけないドメイン。
 * 求人媒体・SNS・まとめサイトを公式サイトと誤認すると、
 * 媒体運営会社の情報で営業メールを書いてしまう。
 */
const EXCLUDED_DOMAINS = [
  "wantedly.com",
  // 媒体運営会社の自社サイト。媒体ページのJSON-LDには運営会社のOrganizationも同居しており、
  // 取り違えると全企業が同じ会社（媒体の運営会社）に紐づく
  "wantedlyinc.com",
  "green-japan.com",
  "en-gage.net",
  "prtimes.jp",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "wikipedia.org",
  "indeed.com",
  "note.com",
  "tiktok.com",
  "ameblo.jp",
  "hatena.ne.jp",
  "openwork.jp",
  "vorkers.com",
  "rikunabi.com",
  "mynavi.jp",
];

function isExcludedDomain(displayLink: string, sourceSite: string): boolean {
  const domain = displayLink.toLowerCase().replace(/^www\./, "");
  if (sourceSite && (domain === sourceSite || domain.endsWith(`.${sourceSite}`))) {
    return true;
  }
  return EXCLUDED_DOMAINS.some((ex) => domain === ex || domain.endsWith(`.${ex}`));
}

/**
 * URL が「公式サイトとして採用してはいけない」ドメインか。
 * 掲載URL由来の候補（lib/listing-resolve.ts）も検索由来と同じ除外リストを通す。
 * 解釈できないURLは採用しない側（true）に倒す。
 */
export function isExcludedHomepageDomain(rawUrl: string): boolean {
  try {
    return isExcludedDomain(new URL(rawUrl).hostname, "");
  } catch {
    return true;
  }
}

export interface ResolvedCompany {
  homepage: string;
  domain: string;
  crawl: CrawlResult;
  /**
   * 掲載元から分かった正式社名（あれば）。
   * 媒体表記と正式社名がずれている企業を「別会社の疑い」で弾かないための照合候補に使う。
   */
  legalName?: string;
}

/**
 * 既にHPが分かっている企業を、検索を一切使わずにクロールし直す。
 *
 * 社名で検索し直すと、検索が壊れている間はHPを知っている企業まで巻き添えで失敗する。
 * 手元にある正準な情報（HPのURL）があるならそれを使う（KB: entity-name-match-unreliable-use-canonical-key）。
 * URLが壊れている・内部宛て等でクロールできない場合は null（＝「見つからない」は正常な結果）。
 */
export async function crawlKnownHomepage(
  hpUrl: string,
  note: string = "既知のHP・検索なし"
): Promise<ResolvedCompany | null> {
  // 保存済みのURLでも、そのまま叩かずSSRF検証を通す（DBが書き換わっている可能性を想定する）
  const validated = validateUrl(hpUrl);
  if (!validated.valid) return null;

  let domain: string;
  try {
    domain = new URL(validated.normalized).hostname;
  } catch {
    return null;
  }

  logActivity(`🕷️ ${validated.normalized} をクロール中...（${note}）`);
  const crawl = await crawlWebsite(validated.normalized);
  logActivity(
    `  → ${crawl.pages.length}ページ取得 / メール${crawl.contactEmails.length}件${crawl.formUrl ? " / フォームあり" : ""}`
  );
  return { homepage: validated.normalized, domain, crawl };
}

/**
 * 企業名から公式サイトを特定してクロールする。
 * 手動の企業解決（keyword-search/resolve）と常時収集の裏処理の両方から呼ぶ。
 * 見つからない場合は null を返す（例外にしない: 「見つからない」は正常な結果）。
 */
export async function resolveCompanyHomepage(
  companyName: string,
  sourceSite: string
): Promise<ResolvedCompany | null> {
  const mode = getSetting("search_mode") || "api";
  const query = `${companyName} 公式サイト`;
  let items;

  if (mode === "scrape") {
    items = await scrapeSearch(query);
  } else {
    const apiKey = getSetting("serper_api_key") || process.env.SERPER_API_KEY;
    if (!apiKey) {
      // 設定エラーとして型で区別する。企業ごとの失敗（HPが無い等）と同じ扱いにすると、
      // 設定1件の不備が数百社分の「調査できず」として記録され続ける
      throw new SearchConfigError("検索APIが未設定です。設定ページからAPIキーを登録してください");
    }
    items = await webSearch(apiKey, query);
  }

  const candidate = items.find(
    (item) => item.link && !isExcludedDomain(item.displayLink, sourceSite)
  );
  if (!candidate) return null;

  let origin: string;
  try {
    origin = new URL(candidate.link).origin;
  } catch {
    return null;
  }

  // 外部から来たURLをそのまま叩かない（SSRF対策・CLAUDE.md 制約8）
  const validated = validateUrl(origin);
  if (!validated.valid) return null;

  logActivity(`🕷️ ${validated.normalized} をクロール中...`);
  const crawl = await crawlWebsite(validated.normalized);
  logActivity(
    `  → ${crawl.pages.length}ページ取得 / メール${crawl.contactEmails.length}件${crawl.formUrl ? " / フォームあり" : ""}`
  );
  return {
    homepage: validated.normalized,
    domain: new URL(validated.normalized).hostname,
    crawl,
  };
}
