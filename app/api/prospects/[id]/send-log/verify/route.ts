import { NextRequest, NextResponse } from "next/server";
import { getProspect, getSendEvidenceByProspect, getSender } from "@/lib/db";
import { fetchSentMessageProof } from "@/lib/gmail";

/**
 * 送信の裏取り: 記録した gmail_message_id で **Gmail 側の実物**を引いて突き合わせる。
 *
 * こちらのDBだけでは「記録が正しいか」を確かめられない（手でステータスを変えられる）。
 * Gmail が持っている受理時刻（internalDate）と宛先・件名を持ってきて並べることで、
 * 「本当にこの時刻に、この宛先へ送られた」を Gmail の記録として示す。
 *
 * 権限は既存の gmail.modify で足りる（読み取りを含む）ので再認証は不要。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prospect = getProspect(Number(id));
    if (!prospect) {
      return NextResponse.json({ error: "生成履歴が見つかりません" }, { status: 404 });
    }

    const logs = getSendEvidenceByProspect(prospect.id);
    if (logs.length === 0) {
      return NextResponse.json({ error: "このメールには送信記録がありません" }, { status: 404 });
    }

    const results = [];
    for (const log of logs) {
      if (!log.gmail_message_id) {
        results.push({ logId: log.id, status: "no_message_id" as const });
        continue;
      }
      const sender = getSender(log.sender_id);
      if (!sender) {
        results.push({ logId: log.id, status: "sender_missing" as const });
        continue;
      }
      try {
        const proof = await fetchSentMessageProof(
          sender.google_refresh_token_encrypted,
          log.gmail_message_id
        );
        results.push({
          logId: log.id,
          status: "verified" as const,
          // Gmail が受理した時刻（epoch ms）。画面側で JST に整形する
          gmailSentAtMs: proof.internalDateMs,
          gmailTo: proof.to,
          gmailSubject: proof.subject,
          inSentBox: proof.labelIds.includes("SENT"),
          threadId: proof.threadId,
          // 宛先・件名がこちらの記録と一致しているか（時刻はサーバのタイムゾーン差があるため判定しない）
          toMatches: (proof.to ?? "").toLowerCase().includes(log.to_email.toLowerCase()),
          subjectMatches: (proof.subject ?? "").trim() === log.subject.trim(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        results.push({
          logId: log.id,
          status:
            message === "MESSAGE_NOT_FOUND"
              ? ("not_found" as const)
              : message === "REAUTH_REQUIRED"
                ? ("reauth_required" as const)
                : ("error" as const),
        });
      }
    }

    return NextResponse.json({
      results,
      // 記録の時刻がどのタイムゾーンで書かれているかを画面が判断できるようにする
      // （サーバが UTC なら DBの 'localtime' も UTC になる）
      serverTimezoneOffsetMinutes: new Date().getTimezoneOffset(),
    });
  } catch (error) {
    console.error("[send-log/verify]", error);
    return NextResponse.json({ error: "Gmailとの照合に失敗しました" }, { status: 500 });
  }
}
