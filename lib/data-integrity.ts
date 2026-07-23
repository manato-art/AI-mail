import {
  getCompaniesForIntegrityCheck,
  markCompanyExcluded,
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
 * 「H4」等の短い社名は本文中に偶然一致・不一致しやすく、誤って除外する危険が高いので触らない。
 */
const MIN_DISTINCTIVE_NAME_LEN = 3;

/**
 * 収集時に社名へ付きがちな拠点・部署などの後置語。
 * 「株式会社ABC 東京本社」のように登録名だけに拠点名が付いていると、HP側（「株式会社ABC」）と
 * 完全一致せず正しい企業を誤って不一致判定してしまう。剥がして再照合するための一覧。
 */
const NAME_NOISE_SUFFIX =
  /(?:本社|本店|本部|支社|支店|営業所|事業所|オフィス|東京|大阪|名古屋|福岡|札幌|仙台|横浜|京都|神戸)+$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(): number {
  return DELAY_BASE_MS + Math.floor(Math.random() * DELAY_JITTER_MS);
}

/** 全角/半角・互換文字を NFKC で畳んでから社名正規化する（ＡＢＣ↔ABC・１２３↔123・半角ｶﾅ↔全角カナを一致させる） */
function foldName(s: string): string {
  return normalizeCompanyName(s.normalize("NFKC"));
}

/**
 * 登録社名が、そのHPのページ本文・タイトルのどこかに現れているか。
 *
 * 自社サイトには通常自社名が載っている前提で、全ページを通して一度も現れない場合は
 * 「収集時の社名検索が別会社のサイトを掴んだ（誤紐付け）」疑いが強い。
 * 法人格・表記ゆれ・区切り記号・全角半角ゆれ（NFKC）を吸収して照合する。
 *
 * 判定材料が乏しい時・確信が持てない時は **除外しない側**（true）に倒す:
 * - 正規化後の社名が短すぎる（偶然一致・不一致のノイズが大きい）
 * - クロールでページが1つも取れなかった（サイト側の一時障害かもしれない）
 * - 拠点・部署の後置語を剥がせば一致する（収集時に付いた表記ノイズ）
 */
export function companyNameAppearsOnSite(companyName: string, pages: CrawlPage[]): boolean {
  if (pages.length === 0) return true; // 取得できず → 判定不能
  const haystack = foldName(pages.map((p) => `${p.title} ${p.text}`).join(" "));
  if (!haystack) return true; // 本文が空 → 判定不能

  const target = foldName(companyName);
  if (target.length < MIN_DISTINCTIVE_NAME_LEN) return true; // 短すぎ → 誤爆回避
  if (haystack.includes(target)) return true;

  // 「株式会社ABC 東京本社」等、登録名だけに拠点・部署の後置語が付くケースを救済
  const stripped = foldName(companyName.normalize("NFKC").replace(NAME_NOISE_SUFFIX, ""));
  if (stripped.length >= MIN_DISTINCTIVE_NAME_LEN && haystack.includes(stripped)) return true;

  return false;
}

export interface IntegrityCheckResult {
  /** 実際に社名照合まで到達した件数 */
  checked: number;
  /** 誤紐付けと判断し、送信対象から除外した件数 */
  excluded: number;
  /** クロール失敗等で判定できず見送った件数 */
  skipped: number;
}

/**
 * 調査完了・連絡先あり企業のHPを再クロールし、登録社名がそのHPに現れるかを照合する。
 * 現れなければ誤紐付けと判断し、その企業を送信対象から**除外**する（誤送信を止める）。
 *
 * データ損失を避けるため連絡先・ドメインは削除せず、企業の状態のみ excluded にして理由を残す
 * （送信リストは調査完了企業だけを対象にするので、除外で誤送信は止まる）。誤検知だった場合は
 * 企業一覧から状態を戻せる（復旧可能）。送信時は danger-check の宛先照合が二重の防御になる。
 *
 * 収集・調査と同じく1社ずつ順番に処理する（相手サイトへの同時アクセスを避ける）。
 * 呼び出し側で LOCK を取り、enrichment と同時に走らないようにすること。
 */
export async function runIntegrityCheckBatch(
  limit: number = INTEGRITY_BATCH_SIZE
): Promise<IntegrityCheckResult> {
  const companies = getCompaniesForIntegrityCheck(limit);
  const result: IntegrityCheckResult = { checked: 0, excluded: 0, skipped: 0 };
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

    // 社名がHPに全く出てこない → 誤紐付けの疑い。データは消さず送信対象から除外する
    const reason = `社名「${company.name}」がHP（${company.domain ?? hp}）に見当たらないため誤紐付けの疑いとして送信対象から除外しました（連絡先は保持・要確認）`;
    markCompanyExcluded(company.id, reason);
    logActivity(`🧹 整合: ${company.name} を送信対象から除外しました（社名がHPに不在・要確認）`, "warn");
    result.excluded += 1;
  }

  logActivity(
    `🏁 整合チェック完了: 照合${result.checked} / 除外${result.excluded} / 見送り${result.skipped}`,
    result.excluded > 0 ? "warn" : "success"
  );
  return result;
}
