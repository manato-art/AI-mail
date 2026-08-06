import { NextRequest, NextResponse } from "next/server";
import {
  setContactLpUrl,
  setCompanyAnalysisByContactEmail,
  type SetLpUrlOutcome,
  type SetAnalysisOutcome,
} from "@/lib/db";
import { validateUrl } from "@/lib/ssrf";
import type { AnalysisResult } from "@/lib/types";

/**
 * 連絡先ごとの個社LP（{{lp_url}}）を後から設定する経路。
 *
 * 商材「かってにHP」は **1店1URL** が核心で、URLは店ごとにページを公開して初めて決まる。
 * 企業の収集と公開は別のタイミングで起きるため、後から流し込む口が要る。
 * （既存の POST /api/companies は upsertContact 経由で、**既存の連絡先には何もしない**）
 *
 * ★ 安全側の設計:
 *   - 見つからなかった行を成功として返さない。「入ったつもり」で送ると、
 *     商材共通のLPにフォールバックして **別の店のページを送る事故** になる
 *   - https のみ。http のURLを提案メールに載せない
 *   - ALLOWED_LP_HOSTS が設定されていれば、そのホスト以外は拒否する
 *     （URLの取り違えは「他店のページを送る」に直結するので、環境で縛れるようにする）
 */
const MAX_ROWS = 500;

interface Row {
  email?: unknown;
  lp_url?: unknown;
  /** LP作成時に集めた調査結果。入れると企業分析はこれが正になり、再クロールしない */
  analysis?: unknown;
  /** 分析の出所（店のページ）。グループのトップではなく店のURLを入れる */
  hp_url?: unknown;
}

/**
 * 送られてきた分析データが最低限の形をしているか見る。
 * 空の器を入れると parseAnalysisJson が null 扱いにして**黙って再クロールに戻る**ので、
 * 「入れたのに効いていない」が起きる。ここで弾いて気づけるようにする。
 */
function checkAnalysis(value: unknown): { ok: true; json: string } | { ok: false; why: string } {
  if (typeof value !== "object" || value === null) return { ok: false, why: "分析データが object ではない" };
  const a = value as Partial<AnalysisResult>;
  if (!a.company_name?.trim()) return { ok: false, why: "company_name が空" };
  if (!a.business_summary?.trim()) return { ok: false, why: "business_summary が空" };
  if (!a.hook?.trim()) return { ok: false, why: "hook が空（AI生成の足場になるので必須）" };
  const json = JSON.stringify(value);
  if (json.length > 100_000) return { ok: false, why: `分析データが大きすぎる（${json.length}バイト）` };
  return { ok: true, json };
}

function allowedHosts(): string[] {
  return (process.env.ALLOWED_LP_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export async function PATCH(request: NextRequest) {
  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "更新する行がありません" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `一度に更新できるのは ${MAX_ROWS} 件までです（${rows.length} 件を受け取りました）` },
      { status: 400 }
    );
  }

  const hosts = allowedHosts();
  const results: Array<{ email: string; outcome: SetLpUrlOutcome | "invalid"; detail?: string }> = [];
  const analysisResults: Array<{ email: string; outcome: SetAnalysisOutcome | "invalid"; detail?: string }> = [];

  for (const row of rows) {
    const email = typeof row.email === "string" ? row.email.trim() : "";
    const raw = typeof row.lp_url === "string" ? row.lp_url.trim() : "";

    if (!email) {
      results.push({ email: "", outcome: "invalid", detail: "メールアドレスが空です" });
      continue;
    }

    // 分析データ（任意）。LP側で集めた調査結果を「この店の正」として入れる
    if (row.analysis !== undefined) {
      const a = checkAnalysis(row.analysis);
      if (!a.ok) {
        analysisResults.push({ email, outcome: "invalid", detail: a.why });
      } else {
        const hp = typeof row.hp_url === "string" && row.hp_url.trim() ? row.hp_url.trim() : null;
        analysisResults.push({ email, outcome: setCompanyAnalysisByContactEmail(email, a.json, hp) });
      }
    }

    // lp_url は任意。分析だけ入れたい場合もある
    if (!raw) continue;

    const checked = validateUrl(raw);
    if (!checked.valid) {
      results.push({ email, outcome: "invalid", detail: checked.error });
      continue;
    }
    const url = new URL(checked.normalized);
    if (url.protocol !== "https:") {
      results.push({ email, outcome: "invalid", detail: "https のURLのみ設定できます" });
      continue;
    }
    if (hosts.length > 0 && !hosts.includes(url.host.toLowerCase())) {
      results.push({
        email,
        outcome: "invalid",
        detail: `許可されていないホストです（${url.host}）。ALLOWED_LP_HOSTS: ${hosts.join(", ")}`,
      });
      continue;
    }

    results.push({ email, outcome: setContactLpUrl(email, checked.normalized) });
  }

  const summary = {
    updated: results.filter((r) => r.outcome === "updated").length,
    unchanged: results.filter((r) => r.outcome === "unchanged").length,
    not_found: results.filter((r) => r.outcome === "not_found").length,
    invalid: results.filter((r) => r.outcome === "invalid").length,
    analysis_updated: analysisResults.filter((r) => r.outcome === "updated").length,
    analysis_failed: analysisResults.filter((r) => r.outcome !== "updated").length,
  };

  // 1件でも入らなかったら 207。200 を返すと呼び出し側のスクリプトが全部成功したと解釈する
  const allOk = summary.not_found === 0 && summary.invalid === 0 && summary.analysis_failed === 0;
  return NextResponse.json({ summary, results, analysisResults }, { status: allOk ? 200 : 207 });
}
