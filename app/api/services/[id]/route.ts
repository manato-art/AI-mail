import { NextRequest, NextResponse } from "next/server";
import { getService, updateService, deleteService } from "@/lib/db";
import type { ServiceInput } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = getService(Number(id));

    if (!service) {
      return NextResponse.json({ error: "サービスが見つかりません" }, { status: 404 });
    }

    return NextResponse.json(service);
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
    const { name, description, strengths, target, lp_url } = body ?? {};

    if (!name || !description || !strengths || !target) {
      return NextResponse.json(
        { error: "サービス名・説明・強み・ターゲットは必須です" },
        { status: 400 }
      );
    }

    const input: ServiceInput = { name, description, strengths, target, lp_url };
    const service = updateService(Number(id), input);

    if (!service) {
      return NextResponse.json({ error: "サービスが見つかりません" }, { status: 404 });
    }

    return NextResponse.json(service);
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
    const deleted = deleteService(Number(id));

    if (!deleted) {
      return NextResponse.json({ error: "サービスが見つかりません" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
