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
  countCompaniesByName,
  findCompanyByDomain,
  countCompaniesByDomain,
  upsertCompany,
  markCompanyEnriched,
} from "@/lib/db";
import { isFreeEmailDomain, companyNamesConsistent, domainsMatch } from "@/lib/email-domains";
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
  const emailDomain = email.split("@")[1]?.toLowerCase();

  // --- 1. 連絡先 → 企業の分析データ ---
  // 連絡先→企業の紐付けは、同名・ドメイン無しでの企業マージ(upsertCompany)により
  // 別会社に付け替わっている可能性がある。ドメインで照合できる時はそれを正とし、
  // 食い違うなら信頼しない（後段の 2/3/4 の照合に委ねる）。
  const contact = getContactByEmail(email);
  if (contact?.company_id) {
    const comp = getCompanyById(contact.company_id);
    const analysis = parseAnalysisJson(comp?.analysis_json);
    if (analysis && comp) {
      const canCheckDomain = !!emailDomain && !isFreeEmailDomain(emailDomain) && !!comp.domain;
      if (canCheckDomain) {
        if (domainsMatch(comp.domain, emailDomain)) return analysis;
        // ドメインが食い違う = マージ/誤紐付けの疑い → 採用せず後段へ
      } else if (!companyName || companyNamesConsistent(comp.name, companyName)) {
        // ドメインで検証できない場合は明示的な紐付けを信頼（社名が分かるなら整合も確認）
        return analysis;
      }
    }
  }

  // --- 2. 企業名で検索 ---
  // 同名異企業（例: ありふれた「株式会社サンプル」）があると LIMIT 1 で無関係な
  // 会社の分析を掴んでしまうため、社名が一意に定まる時だけ採用する。
  if (companyName && countCompaniesByName(companyName) === 1) {
    const comp = findCompanyByName(companyName);
    const analysis = parseAnalysisJson(comp?.analysis_json);
    if (analysis) return analysis;
  }

  // --- 3. メールドメインで検索 ---
  // ドメイン一致は「別会社の分析を宛先に貼り付ける」最大の事故源。
  //   - フリーメール（gmail.com 等）は企業の同定に使えない → 使わない
  //   - 社名が分かる場合は、ドメイン一致した会社の名前と食い違うなら共有ドメイン
  //     （グループ会社・レンタルサーバ）とみなして採用しない
  //   - 社名が無い場合は、そのドメインに1社しか無い時だけ採用する
  if (emailDomain && !isFreeEmailDomain(emailDomain)) {
    const comp = findCompanyByDomain(emailDomain);
    const analysis = parseAnalysisJson(comp?.analysis_json);
    if (analysis && comp) {
      const identityOk = companyName
        ? companyNamesConsistent(comp.name, companyName)
        : countCompaniesByDomain(emailDomain) === 1;
      if (identityOk) return analysis;
    }
  }

  // --- 4. オンデマンド: 公式サイト検索→クロール→分析 ---
  if (!companyName) return null;

  const resolved = await resolveCompanyHomepage(companyName, "");
  if (!resolved || resolved.crawl.pages.length === 0) return null;

  // 検索で辿り着いたサイトが宛先自身のドメインと食い違うなら、同名の別会社を
  // 掴んだ可能性が高い。誤った会社の分析をこの宛先に貼り付けないよう、使わず
  // キャッシュもしない（呼び出し側は分析なし＝警告付き汎用文になる・#6）。
  if (emailDomain && !isFreeEmailDomain(emailDomain) && !domainsMatch(resolved.domain, emailDomain)) {
    return null;
  }

  const analysis = await analyzeCompany(resolved.crawl, service);

  // 空/不完全な分析（例: Geminiが {} 相当を返す）は「取得できなかった」扱いにする。
  // truthy な空オブジェクトをそのまま返すと、無警告で中身の無い個社文面になる（#5）。
  if (!analysis || (!analysis.company_name && !analysis.business_summary)) {
    return null;
  }

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
