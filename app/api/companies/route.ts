import { NextRequest, NextResponse } from "next/server";
import {
  getAllCompanies,
  getCompaniesWithTags,
  getAllContacts,
  upsertCompany,
  upsertContact,
  deleteCompany,
  updateCompanyHpUrl,
} from "@/lib/db";
import { validateUrl } from "@/lib/ssrf";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BATCH = 500;

interface IncomingRow {
  name?: string;
  domain?: string | null;
  hpUrl?: string | null;
  email?: string | null;
  personName?: string | null;
  emailSourceUrl?: string | null;
  recruitPageUrl?: string | null;
  lpUrl?: string | null;
}

export function GET() {
  return NextResponse.json({
    companies: getCompaniesWithTags(),
    contacts: getAllContacts(),
  });
}

/**
 * 企業と連絡先をまとめて登録する（キーワード検索の結果・CSV取込の受け皿）。
 * 同一ドメインの企業・同一メールの連絡先は重複登録しない（仕様書F1）。
 */
export async function POST(request: NextRequest) {
  let body: { source?: string; sourceDetail?: string; rows?: IncomingRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const source = typeof body.source === "string" && body.source ? body.source : "manual";
  const sourceDetail = typeof body.sourceDetail === "string" ? body.sourceDetail : "";
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_BATCH) : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "登録する企業がありません" }, { status: 400 });
  }

  let companiesAdded = 0;
  let contactsAdded = 0;
  let skipped = 0;

  const beforeCompanies = new Set(getAllCompanies().map((c) => c.id));
  const beforeContacts = new Set(getAllContacts().map((c) => c.id));

  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) { skipped++; continue; }

    const company = upsertCompany({
      name,
      domain: typeof row.domain === "string" ? row.domain.trim() : null,
      source,
      source_detail: sourceDetail,
      hp_url: typeof row.hpUrl === "string" ? row.hpUrl : null,
      recruit_page_url: typeof row.recruitPageUrl === "string" ? row.recruitPageUrl : null,
      lp_url: typeof row.lpUrl === "string" ? row.lpUrl : null,
    });
    if (!beforeCompanies.has(company.id)) {
      beforeCompanies.add(company.id);
      companiesAdded++;
    }

    const email = typeof row.email === "string" ? row.email.trim() : "";
    if (!email || !EMAIL_PATTERN.test(email)) continue;

    const contact = upsertContact({
      company_id: company.id,
      company_name: name,
      person_name: typeof row.personName === "string" ? row.personName : "",
      email,
      email_source_url: typeof row.emailSourceUrl === "string" ? row.emailSourceUrl : row.hpUrl ?? null,
      source,
      lp_url: typeof row.lpUrl === "string" ? row.lpUrl : null,
    });
    if (!beforeContacts.has(contact.id)) {
      beforeContacts.add(contact.id);
      contactsAdded++;
    }
  }

  return NextResponse.json({ companiesAdded, contactsAdded, skipped });
}

export async function PATCH(request: NextRequest) {
  let body: { id?: unknown; hp_url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = Number(body?.id);
  const hpUrl = typeof body?.hp_url === "string" ? body.hp_url.trim() : "";

  if (!Number.isInteger(id) || !hpUrl) {
    return NextResponse.json({ error: "id と hp_url が必要です" }, { status: 400 });
  }

  const validated = validateUrl(hpUrl);
  if (!validated.valid) {
    return NextResponse.json({ error: validated.error ?? "URLの形式が不正です" }, { status: 400 });
  }

  const company = updateCompanyHpUrl(id, validated.normalized);
  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ company });
}

export async function DELETE(request: NextRequest) {
  let id: unknown;
  try {
    const body = await request.json();
    id = body?.id;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Number.isInteger(Number(id))) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!deleteCompany(Number(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
