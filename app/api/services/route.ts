import { NextRequest, NextResponse } from "next/server";
import { getAllServices, createService } from "@/lib/db";
import type { ServiceInput } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json(getAllServices());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, strengths, target, lp_url } = body ?? {};

    if (!name || !description || !strengths || !target) {
      return NextResponse.json(
        { error: "name, description, strengths, and target are required" },
        { status: 400 }
      );
    }

    const input: ServiceInput = { name, description, strengths, target, lp_url };
    const service = createService(input);

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
