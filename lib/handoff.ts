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
  getCompanyById,
  getCompanyByPlaceId,
  markCompanyEnriched,
  setCompanyPlaceId,
  setContactCompany,
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
  // 型は信用しない（外部ファイル由来）。数値やobjectが入っていると `?.trim()` が
  // TypeError を投げ、**バッチ全体が500で落ちて成功済み分の結果まで消える**
  // （2026-08-08 独立レビューが実際に再現）。文字列でないものは invalid として返す
  const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  if (!nonEmptyString(a.company_name)) return { ok: false, why: "analysis.company_name が文字列でないか空" };
  if (!nonEmptyString(a.business_summary)) return { ok: false, why: "analysis.business_summary が文字列でないか空" };
  if (!nonEmptyString(a.hook)) return { ok: false, why: "analysis.hook が文字列でないか空（AI生成の足場になるので必須）" };
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
  if (name.length > 200 || email.length > 320 || hpUrl.length > 2000 || lpUrl.length > 2000) {
    return { ok: false, outcome: "invalid", detail: "フィールドが長すぎます（company_name≤200 / email≤320 / URL≤2000）" };
  }
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

    /**
     * ★ 同一店かどうかの判定（2026-08-08 独立レビューで作り直し）。
     *
     * 最初の実装は「place_id 一致 OR 分析内の店名一致」で同一店とみなしていたが、
     * これは2つの穴を持っていた:
     *   1. name で upsert した行は **name が一致したからヒットした**ので、店名一致は
     *      同一店の証拠として無意味（チェーン店・同名別店で常に真になり、検査が素通り）
     *   2. 両者が place_id を持っていて食い違っても、名前一致が握りつぶしていた
     *
     * 正しい判定:
     *   - 両者が place_id を持つ → **place_id の一致だけ**が証拠（名前で救済しない）
     *   - どちらかが欠ける → **hp_url（店のページ）の一致**で判定する。
     *     同名の別店は別のページを持つ。同じページを指すなら同じ店の更新
     */
    if (company.analysis_source === "lp") {
      const norm = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
      const bothHavePlaceId = !!placeId && !!company.place_id;
      const identityConfirmed = bothHavePlaceId
        ? company.place_id === placeId
        : !!company.hp_url && norm(company.hp_url) === norm(hpUrl);
      if (!identityConfirmed) {
        let existing: Partial<AnalysisResult> = {};
        try { existing = JSON.parse(company.analysis_json); } catch { /* 壊れていれば空扱い */ }
        return {
          ok: false,
          outcome: "conflict",
          detail:
            `company #${company.id}「${name}」には別の店のLP由来データが入っています` +
            `（既存HP: ${company.hp_url ?? "?"} / 今回: ${hpUrl}${existing.company_name ? ` / 既存分析: ${existing.company_name}` : ""}）。` +
            `同名の別店なら place_id を付けて取り込んでください`,
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

  /**
   * ★ 既存の連絡先が**別の会社**に紐付いている場合の扱い（2026-08-08 独立レビューで追加）。
   *
   * upsertContact は既存行に触らないため、放置すると取込は「成功」なのに
   * 送信時の分析解決（resolveAnalysisForRecipient）が古い company_id を辿り、
   * **LPはそば屋・本文は別事業**の事故が別経路で再現する。
   *
   * - 古い紐付け先が **別のLP由来の店**（analysis_source='lp'）→ 2つの店が1つの
   *   受信箱を共有している。lp_url も後勝ちで潰し合うので、機械で決めずに conflict
   * - それ以外（自動収集などが作った紐付け）→ LP側を正として付け替える
   */
  if (contact.company_id !== null && contact.company_id !== company.id) {
    const old = getCompanyById(contact.company_id);
    if (old && old.analysis_source === "lp") {
      return {
        ok: false,
        outcome: "conflict",
        detail:
          `宛先 ${email} は既に別のLP店「${old.name}」に紐付いています。` +
          `2つの店が同じ受信箱を共有している状態で、どちらのURLを送るか機械には決められません`,
      };
    }
    setContactCompany(email, company.id, name);
  }

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
