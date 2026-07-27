import type { EnrichmentErrorKind } from "@/lib/types";

/**
 * 調査失敗の分類まわりの共通処理。
 *
 * この層に型以外の依存を持たせない（DB・検索・UI のどこからでも読めるようにするため）。
 * 分類そのものの定義は lib/types.ts の EnrichmentErrorKind。
 */

/**
 * 「その企業の事情ではなく、こちらの基盤が止まっている」種類の失敗。
 * これを企業ごとの失敗として記録し続けると、障害1件が数百社分の×印になる。
 * 検出したら調査バッチを打ち切り、残りは pending のまま復旧を待つ。
 */
const INFRASTRUCTURE_KINDS: ReadonlySet<string> = new Set<EnrichmentErrorKind>([
  "search_blocked",
  "config_missing",
]);

export function isInfrastructureErrorKind(kind: string | null | undefined): boolean {
  return !!kind && INFRASTRUCTURE_KINDS.has(kind);
}

/**
 * 画面に出す平易な日本語。非エンジニアが「自分たちの設定の問題か、
 * その企業固有の事情か」を読んだだけで切り分けられる文言にする。
 */
export const ERROR_KIND_LABELS: Record<EnrichmentErrorKind, string> = {
  search_blocked: "検索がブロックされています（企業側の問題ではありません）",
  config_missing: "検索の設定が未完了です（企業側の問題ではありません）",
  hp_not_found: "公式サイトを見つけられませんでした",
  crawl_empty: "公式サイトの中身を読み取れませんでした",
  name_mismatch: "見つかったサイトが別の会社の可能性があります",
  analyze_failed: "AIの分析だけが失敗しました（連絡先は残っています）",
  unknown: "原因が特定できないエラーです",
};

/** 分類が無い（列追加より前に記録された）行も含めて、必ず読める文言にする */
export function describeErrorKind(kind: string | null | undefined): string {
  if (!kind) return "理由が記録されていません（古い記録）";
  return ERROR_KIND_LABELS[kind as EnrichmentErrorKind] ?? "原因が特定できないエラーです";
}
