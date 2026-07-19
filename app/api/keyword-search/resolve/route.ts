import { NextRequest, NextResponse } from "next/server";
import { extractContactName } from "@/lib/keyword-search";
import { resolveCompanyHomepage } from "@/lib/company-resolve";

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

    const resolved = await resolveCompanyHomepage(companyName, sourceSite);
    if (!resolved) {
      return NextResponse.json({ found: false });
    }

    if (resolved.crawl.pages.length === 0) {
      return NextResponse.json({
        found: true,
        homepage: resolved.homepage,
        domain: resolved.domain,
        email: null,
        formUrl: null,
        personName: null,
        recruitPageUrl: null,
        crawlFailed: true,
      });
    }

    const personName = await extractContactName(companyName, resolved.crawl.pages);

    return NextResponse.json({
      found: true,
      homepage: resolved.homepage,
      domain: resolved.domain,
      email: resolved.crawl.contactEmails[0] ?? null,
      formUrl: resolved.crawl.formUrl,
      personName,
      recruitPageUrl: resolved.crawl.recruitPageUrl,
      crawlFailed: false,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "企業情報の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
