import {
  getCompaniesForIntegrityCheck,
  revertCompanyForReinvestigation,
  stampCompanyIntegrityChecked,
} from "@/lib/db";
import { crawlWebsite } from "@/lib/crawl";
import { normalizeCompanyName } from "@/lib/email-domains";
import { logActivity } from "@/lib/activity-log";
import type { CrawlPage } from "@/lib/types";

/** 1バッチで再クロールする件数。1社1クロールなので少しずつ進める */
const INTEGRITY_BATCH_SIZE = 10;
const DELAY_BASE_MS = 2000;
const DELAY_JITTER_MS = 3000;
/**
 * 正規化後の社名がこの長さ未満なら整合判定の対象外にする。
 * 「H4」等の短い社名は本文中に偶然一致・不一致しやすく、誤って消す危険が高いので触らない。
 */
const MIN_DISTINCTIVE_NAME_LEN = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(): number {
  return DELAY_BASE_MS + Math.floor(Math.random() * DELAY_JITTER_MS);
}

/**
 * 登録社名が、そのHPのページ本文・タイトルのどこかに現れているか。
 *
 * 自社サイトには通常自社名が載っている前提で、全ページを通して一度も現れない場合は
 * 「収集時の社名検索が別会社のサイトを掴んだ（誤紐付け）」疑いが強い。
 * 法人格・表記ゆれ・区切り記号は normalizeCompanyName で吸収して照合する。
 *
 * 判定材料が乏しい時は **消さない側**（true）に倒す:
 * - 正規化後の社名が短すぎる（偶然一致・不一致のノイズが大きい）
 * - クロールでページが1つも取れなかった（サイト側の一時障害かもしれない）
 */
export function companyNameAppearsOnSite(companyName: string, pages: CrawlPage[]): boolean {
  const target = normalizeCompanyName(companyName);
  if (target.length < MIN_DISTINCTIVE_NAME_LEN) return true; // 判定不能 → 誤爆回避で「一致」扱い
  if (pages.length === 0) return true; // 取得できず → 判定不能
  const haystack = normalizeCompanyName(pages.map((p) => `${p.title} ${p.text}`).join(" "));
  return haystack.includes(target);
}

export interface IntegrityCheckResult {
  /** 実際に社名照合まで到達した件数 */
  checked: number;
  /** 誤紐付けと判断し、連絡先を無効化・再調査へ戻した件数 */
  reverted: number;
  /** クロール失敗等で判定できず見送った件数 */
  skipped: number;
}

/**
 * 調査完了・連絡先あり企業のHPを再クロールし、登録社名がそのHPに現れるかを照合する。
 * 現れなければ誤紐付けと判断して連絡先を無効化し、再調査キューへ戻す（誤送信を止める）。
 *
 * 収集・調査と同じく1社ずつ順番に処理する（相手サイトへの同時アクセスを避ける）。
 * 呼び出し側で LOCK を取り、enrichment と同時に走らないようにすること。
 */
export async function runIntegrityCheckBatch(
  limit: number = INTEGRITY_BATCH_SIZE
): Promise<IntegrityCheckResult> {
  const companies = getCompaniesForIntegrityCheck(limit);
  const result: IntegrityCheckResult = { checked: 0, reverted: 0, skipped: 0 };
  if (companies.length === 0) return result;

  logActivity(`🧭 ${companies.length}社のデータ整合チェックを開始します`);

  for (const [index, company] of companies.entries()) {
    if (index > 0) await sleep(nextDelay());

    const hp = company.hp_url;
    if (!hp) {
      // HPが無い企業は対象外だが、念のため確認済みにして次の抽出から外す
      stampCompanyIntegrityChecked(company.id);
      continue;
    }

    let pages: CrawlPage[];
    try {
      const crawl = await crawlWebsite(hp);
      pages = crawl.pages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "クロール失敗";
      console.error("integrity crawl failed:", company.name, message);
      // 一時的な失敗で毎tick再クロールし続けないよう確認済みにする（次の再確認期限で再挑戦）
      stampCompanyIntegrityChecked(company.id);
      result.skipped += 1;
      continue;
    }

    if (pages.length === 0) {
      stampCompanyIntegrityChecked(company.id);
      result.skipped += 1;
      continue;
    }

    result.checked += 1;

    if (companyNameAppearsOnSite(company.name, pages)) {
      // 社名が確認できた → 整合。確認時刻だけ更新して据え置く
      stampCompanyIntegrityChecked(company.id);
      continue;
    }

    // 社名がHPに全く出てこない → 誤紐付けの疑い。連絡先を無効化して再調査へ戻す
    const reason = `社名「${company.name}」がHP（${company.domain ?? hp}）に見当たらないため誤紐付けと判断し、連絡先を無効化して再調査に戻しました`;
    revertCompanyForReinvestigation(company.id, reason);
    logActivity(`🧹 整合: ${company.name} を再調査に戻しました（社名がHPに不在）`, "warn");
    result.reverted += 1;
  }

  logActivity(
    `🏁 整合チェック完了: 照合${result.checked} / 是正${result.reverted} / 見送り${result.skipped}`,
    result.reverted > 0 ? "warn" : "success"
  );
  return result;
}
