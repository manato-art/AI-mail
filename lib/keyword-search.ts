import Anthropic from "@anthropic-ai/sdk";
import { AI_SITE_POOL } from "@/lib/keyword-search-constants";
import { fenceUntrusted } from "@/lib/prompt-fence";
import type { CrawlPage, KeywordCompany } from "@/lib/types";

const client = new Anthropic();

const MODEL = process.env.KEYWORD_SEARCH_MODEL || "claude-sonnet-4-6";

const SERPER_ENDPOINT = "https://google.serper.dev/search";
const RESULTS_PER_PAGE = 10;

export interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

/**
 * 上流から「叩き過ぎ・一時的に拒否」を示された状態。
 * 常時収集（lib/collection.ts）はこれを受けたら即座にそのソースを止める。
 * 普通のエラーと同じ Error にしてしまうと、文言マッチでしか判別できず取りこぼす。
 */
export class SearchBlockedError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SearchBlockedError";
    this.status = status;
  }
}

/** 叩き過ぎ・拒否とみなすHTTPステータス */
export const BLOCKED_STATUSES = new Set([403, 429, 503]);

export async function webSearch(
  apiKey: string,
  query: string,
  page: number = 0
): Promise<SearchResultItem[]> {
  const res = await fetch(SERPER_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "jp",
      hl: "ja",
      num: RESULTS_PER_PAGE,
      page: page + 1,
    }),
  });

  if (!res.ok) {
    // 上流のレスポンス本文はキーの断片や内部情報を含み得るので、
    // サーバログにだけ出してUIには status しか返さない（CLAUDE.md 制約6）
    const body = await res.text().catch(() => "");
    console.error("Serper API error:", res.status, body.slice(0, 500));

    if (res.status === 429) {
      throw new SearchBlockedError("検索APIの利用上限に達しました", res.status);
    }
    if (res.status === 503) {
      throw new SearchBlockedError("検索APIが一時的に利用できません", res.status);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("検索APIキーが無効です。設定ページで正しいキーを登録してください");
    }
    throw new Error(`検索APIエラーが発生しました（コード: ${res.status}）`);
  }

  const data = await res.json();
  const organic = Array.isArray(data.organic) ? data.organic : [];
  return organic.map(
    (item: { title?: string; link?: string; snippet?: string; domain?: string }) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? "",
      displayLink: item.domain ?? "",
    })
  );
}

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseJsonResponse<T>(rawText: string): T {
  try {
    return JSON.parse(rawText) as T;
  } catch {
    const extracted = extractJsonFromText(rawText);
    try {
      return JSON.parse(extracted) as T;
    } catch {
      throw new Error("AI応答のJSONパースに失敗しました");
    }
  }
}

async function askAi(system: string, userPrompt: string, maxTokens: number = 1024): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI応答からテキストを取得できませんでした");
  }
  return textBlock.text;
}

export interface SiteDecision {
  site: string;
  reason: string;
}

export async function decideSearchSite(keyword: string): Promise<SiteDecision> {
  const poolText = AI_SITE_POOL.map((s) => `- ${s.domain}（${s.label}: ${s.genre}）`).join("\n");

  const system = `あなたは営業リスト作成アシスタントです。ユーザーのキーワードに対して、該当企業を探すのに最適な検索元サイトを1つ選びます。

候補プール（この中から選ぶことを優先。どれも合わない場合のみ、一般に知られる他の公開サイトを提案してよい）:
${poolText}

出力は必ず以下のJSON形式のみ:
{"site": "wantedly.com", "reason": "選定理由（1文）"}

siteはドメインのみ（https://やパスは含めない）。`;

  const raw = await askAi(system, `キーワード: ${keyword}`, 512);
  const parsed = parseJsonResponse<SiteDecision>(raw);
  const site = (parsed.site || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  if (!site) {
    throw new Error("検索元サイトの判断に失敗しました");
  }
  return { site, reason: parsed.reason || "" };
}

export interface CompanyExtraction {
  companies: KeywordCompany[];
  fallbackContact: string;
}

export async function extractCompanies(
  keyword: string,
  site: string,
  items: SearchResultItem[],
  maxCount: number
): Promise<CompanyExtraction> {
  const itemsText = items
    .map((item, i) => `${i + 1}. タイトル: ${item.title}\n   URL: ${item.link}\n   抜粋: ${item.snippet}`)
    .join("\n");

  const system = `あなたは営業リスト作成アシスタントです。検索結果の一覧から企業名を抽出します。

ルール:
1. タイトル・抜粋に実際に書かれている企業名のみ抽出する（推測で創作しない）
2. 検索元サイトの運営会社自体（例: ウォンテッドリー株式会社）は除外する
3. 同じ企業の重複は1つにまとめる
4. 企業名は正式表記を優先（「株式会社」等を含む形が分かればその形で）
5. 最大${maxCount}社まで
6. fallback_contact: キーワードの分野から、担当者名が不明な場合の宛名を決める（採用系なら「採用ご担当者様」、それ以外は「ご担当者様」等）

出力は必ず以下のJSON形式のみ:
{"companies": [{"name": "株式会社〇〇", "sourceUrl": "検索結果のURL"}], "fallback_contact": "採用ご担当者様"}`;

  const userPrompt = `キーワード: ${keyword}
検索元サイト: ${site}

${fenceUntrusted("検索結果データ", itemsText)}

企業名を抽出してJSONで返してください。`;

  const raw = await askAi(system, userPrompt, 2048);
  const parsed = parseJsonResponse<{ companies?: { name?: string; sourceUrl?: string }[]; fallback_contact?: string }>(raw);

  const seen = new Set<string>();
  const companies: KeywordCompany[] = [];
  for (const c of parsed.companies ?? []) {
    const name = (c.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    companies.push({ name, sourceUrl: c.sourceUrl || "" });
    if (companies.length >= maxCount) break;
  }

  return {
    companies,
    fallbackContact: parsed.fallback_contact?.trim() || "ご担当者様",
  };
}

const CONTACT_PAGE_PATTERN = /(会社概要|会社案内|company|about|contact|お?問い?合わせ|採用|recruit|求人)/i;
const CONTACT_TEXT_LIMIT = 4000;

export async function extractContactName(
  companyName: string,
  pages: CrawlPage[]
): Promise<string | null> {
  const candidatePages = pages.filter(
    (page, index) => index === 0 || CONTACT_PAGE_PATTERN.test(`${page.url} ${page.title}`)
  );
  if (candidatePages.length === 0) return null;

  let text = "";
  for (const page of candidatePages) {
    if (text.length >= CONTACT_TEXT_LIMIT) break;
    text += `【${page.title}】\n${page.text.slice(0, 1500)}\n\n`;
  }
  text = text.slice(0, CONTACT_TEXT_LIMIT);

  const system = `あなたは営業リスト作成アシスタントです。企業サイトのテキストから、営業メールの宛名に使える人物名を探します。

ルール:
1. テキストに明記されている氏名のみ返す（創作・推測は絶対禁止）
2. 優先順位: 採用担当者名 > 人事責任者名 > 代表者名
3. 役職が分かれば「人事部長 田中太郎」のように役職+氏名で返す
4. 「様」は付けない
5. 見つからなければ null

出力は必ず以下のJSON形式のみ:
{"contact_name": "代表取締役 田中太郎"} または {"contact_name": null}`;

  const userPrompt = `企業名: ${companyName}

${fenceUntrusted("サイトテキスト", text)}

宛名に使える氏名をJSONで返してください。`;

  try {
    const raw = await askAi(system, userPrompt, 256);
    const parsed = parseJsonResponse<{ contact_name?: string | null }>(raw);
    const name = (parsed.contact_name || "").trim();
    return name || null;
  } catch {
    return null;
  }
}
