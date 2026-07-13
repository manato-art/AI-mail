import { NextRequest, NextResponse } from "next/server";
import { getPersona, updatePersona, deletePersona } from "@/lib/db";
import type { PersonaInput } from "@/lib/types";

function isValidParam(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const persona = getPersona(Number(id));

    if (!persona) {
      return NextResponse.json({ error: "人格が見つかりません" }, { status: 404 });
    }

    return NextResponse.json(persona);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      title,
      gender,
      age_range,
      company_name,
      signature_block,
      logic,
      passion,
      politeness,
      salesiness,
      length,
    } = body ?? {};

    if (!name || !title) {
      return NextResponse.json(
        { error: "名前と肩書きは必須です" },
        { status: 400 }
      );
    }

    if (![logic, passion, politeness, salesiness, length].every(isValidParam)) {
      return NextResponse.json(
        {
          error:
            "logic, passion, politeness, salesiness, and length must be integers between 1 and 5",
        },
        { status: 400 }
      );
    }

    const input: PersonaInput = {
      name,
      title,
      gender,
      age_range,
      company_name,
      signature_block,
      logic,
      passion,
      politeness,
      salesiness,
      length,
    };

    const persona = updatePersona(Number(id), input);

    if (!persona) {
      return NextResponse.json({ error: "人格が見つかりません" }, { status: 404 });
    }

    return NextResponse.json(persona);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deletePersona(Number(id));

    if (!deleted) {
      return NextResponse.json({ error: "人格が見つかりません" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
