import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";

const client = new Anthropic();
const MODEL = process.env.ANALYSIS_MODEL || "claude-sonnet-4-6";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

function isAllowedExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "md", "txt", "markdown"].includes(ext);
}

const SYSTEM_PROMPT = `あなたはサービス仕様書のパーサーです。
ユーザーが貼り付けたサービス仕様書・企画書・説明文から、以下の5項目を抽出してください。

出力は必ず以下のJSON形式のみで返してください。それ以外のテキストは含めないでください:
{
  "name": "サービス名（正式名称）",
  "description": "サービスの概要説明（2-4文で簡潔に）",
  "strengths": "サービスの強み・差別化ポイント（箇条書きではなく文章で）",
  "target": "ターゲット顧客（業種・規模・課題など）",
  "lp_url": "LP・HPのURL（文中にあれば。なければ空文字）"
}

抽出のルール:
- 原文の表現をできるだけ活かす
- 情報が明示されていない項目は、文脈から合理的に推測して埋める
- 推測できない場合は空文字にする
- descriptionは営業メール生成に使うため、サービスの価値が伝わる内容にする
- strengthsは競合との差別化が分かる内容にする`;

async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  return await file.text();
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "ファイルが選択されていません。" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは5MB以下にしてください。" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type) && !isAllowedExtension(file.name)) {
      return NextResponse.json(
        { error: "PDF・Markdown・テキストファイルのみ対応しています。" },
        { status: 400 }
      );
    }

    const text = await extractText(file);

    if (!text.trim()) {
      return NextResponse.json(
        { error: "ファイルからテキストを抽出できませんでした。" },
        { status: 400 }
      );
    }

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text.trim() }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "解析に失敗しました。" },
        { status: 500 }
      );
    }

    const raw = content.text.replace(/```(?:json)?\s*/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(raw);

    return NextResponse.json({
      name: String(parsed.name ?? ""),
      description: String(parsed.description ?? ""),
      strengths: String(parsed.strengths ?? ""),
      target: String(parsed.target ?? ""),
      lp_url: String(parsed.lp_url ?? ""),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ファイルの解析に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
