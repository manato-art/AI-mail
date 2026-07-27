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

export interface ResolvedCompany {
  homepage: string;
  domain: string;
  crawl: CrawlResult;
}

/**
 * 既にHPが分かっている企業を、検索を一切使わずにクロールし直す。
 *
 * 社名で検索し直すと、検索が壊れている間はHPを知っている企業まで巻き添えで失敗する。
 * 手元にある正準な情報（HPのURL）があるならそれを使う（KB: entity-name-match-unreliable-use-canonical-key）。
 * URLが壊れている・内部宛て等でクロールできない場合は null（＝「見つからない」は正常な結果）。
 */
export async function crawlKnownHomepage(hpUrl: string): Promise<ResolvedCompany | null> {
  // 保存済みのURLでも、そのまま叩かずSSRF検証を通す（DBが書き換わっている可能性を想定する）
  const validated = validateUrl(hpUrl);
  if (!validated.valid) return null;

  let domain: string;
  try {
    domain = new URL(validated.normalized).hostname;
  } catch {
    return null;
  }

  logActivity(`🕷️ ${validated.normalized} をクロール中...（既知のHP・検索なし）`);
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
