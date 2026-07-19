import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { extractContactName, webSearch } from "@/lib/keyword-search";
import { crawlWebsite } from "@/lib/crawl";
import { validateUrl } from "@/lib/ssrf";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const sourceSite = typeof body?.sourceSite === "string"
      ? body.sourceSite.trim().toLowerCase().replace(/^www\./, "")
      : "";

    if (!companyName) {
      return NextResponse.json({ error: "企業名を指定してください" }, { status: 400 });
    }

    const apiKey = getSetting("serper_api_key") || process.env.SERPER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "検索APIが未設定です。設定ページからSerper APIキーを登録してください" },
        { status: 400 }
      );
    }

    const items = await webSearch(apiKey, `${companyName} 公式サイト`);
    const candidate = items.find((item: { link: string; displayLink: string }) => item.link && !isExcludedDomain(item.displayLink, sourceSite));

    if (!candidate) {
      return NextResponse.json({ found: false });
    }

    let origin: string;
    try {
      origin = new URL(candidate.link).origin;
    } catch {
      return NextResponse.json({ found: false });
    }

    const validated = validateUrl(origin);
    if (!validated.valid) {
      return NextResponse.json({ found: false });
    }

    const crawlResult = await crawlWebsite(validated.normalized);
    const domain = new URL(validated.normalized).hostname;

    if (crawlResult.pages.length === 0) {
      return NextResponse.json({
        found: true,
        homepage: validated.normalized,
        domain,
        email: null,
        formUrl: null,
        personName: null,
        crawlFailed: true,
      });
    }

    const personName = await extractContactName(companyName, crawlResult.pages);

    return NextResponse.json({
      found: true,
      homepage: validated.normalized,
      domain,
      email: crawlResult.contactEmails[0] ?? null,
      formUrl: crawlResult.formUrl,
      personName,
      crawlFailed: false,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "企業情報の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
