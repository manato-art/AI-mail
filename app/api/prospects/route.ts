import { NextResponse } from "next/server";
import { getAllProspects } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(getAllProspects());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
