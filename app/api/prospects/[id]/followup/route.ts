import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getProspect } from "@/lib/db";

const client = new Anthropic();
const MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `あなたは営業メールのフォローアップ文面を作成するAIです。
初回メールに対して返信がなかった場合のフォローアップメールを作成します。

【ルール】
1. 初回メールの内容を踏まえつつ、重複しすぎないようにする
2. 「先日お送りしたメールの件で」等、初回メールへの言及から始める
3. 初回メールより短く簡潔にする（150〜250字）
4. 新しい価値や切り口を1つ追加する
5. 押しつけがましくならない柔らかいトーン
6. 絵文字・顔文字禁止、敬語正確

出力は必ず以下のJSON形式のみで返してください:
{"subject": "件名", "body": "本文"}`;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prospect = getProspect(Number(id));
  if (!prospect) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `以下の初回メールに対するフォローアップメールを作成してください。

【初回メールの件名】
${prospect.subject}

【初回メールの本文】
${prospect.body}

【相手企業】
${prospect.company_name || prospect.domain}

JSONで出力してください。`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "AI応答が空です" }, { status: 500 });
    }

    const raw = textBlock.text.trim();
    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return NextResponse.json({ error: "AI応答のパースに失敗" }, { status: 500 });
      parsed = JSON.parse(match[0]);
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Follow-up generation error:", err);
    return NextResponse.json({ error: "フォローアップの生成に失敗しました" }, { status: 500 });
  }
}
