import { createSendLog, updateProspectStatus, addSuppression } from "@/lib/db";

export interface RecordSendParams {
  prospectId: number;
  senderId: number;
  /** 実際に送信したアドレス（TEST_MODE時はテストアドレス）。send_log に残す値 */
  toEmail: string;
  /** 本来の宛先。重複送信ガード・抑止のキーになる実アドレス */
  realToEmail: string;
  subject: string;
  messageId?: string | null;
  threadId?: string | null;
}

/**
 * メール送信が成功した「後」の記録処理（#9）。
 *
 * 重要な不変条件: ここに来た時点でメールは既に相手に届いている。
 * したがって、この関数内のどの失敗も
 *   - prospect を 'unsent' に戻さない（次回の再送事故を防ぐ）
 *   - 呼び出し側に「送信失敗」を返させない
 * ようにし、失敗は警告に降格して返す。send/bulk-send の両経路で同じ挙動にするため共通化する。
 *
 * - send_log は重複送信ガード(hasSentToEmail)の唯一の根拠なので2回試行する。
 * - それでも記録できなかった場合、将来の再送でガードが素通りしてしまう(#7が破れる)ため、
 *   実宛先を抑止リストに登録して次回以降の送信を確実にブロックし、警告を返す。
 * - prospect の 'sent' 確定も2回試行し、失敗しても 'unsent' には戻さず警告に留める。
 */
export function recordSuccessfulSend(
  p: RecordSendParams,
  testMode = false
): { warnings: string[] } {
  // テストモードはテストアドレス宛の動作確認であり、実企業への送信実績ではない。
  // 送信履歴(send_log)を残さず、prospect も 'unsent' に戻して「未送信」として扱う
  // （企業一覧の送信済みバッジ・履歴の状態ともに未送信のままにする）。
  if (testMode) {
    try {
      updateProspectStatus(p.prospectId, "unsent");
    } catch (err) {
      console.error("テスト送信後の status リセットに失敗:", { prospectId: p.prospectId, error: err });
    }
    return { warnings: [] };
  }

  const warnings: string[] = [];

  let logged = false;
  for (let attempt = 0; attempt < 2 && !logged; attempt++) {
    try {
      createSendLog({
        prospect_id: p.prospectId,
        sender_id: p.senderId,
        to_email: p.toEmail,
        subject: p.subject,
        gmail_message_id: p.messageId ?? null,
        gmail_thread_id: p.threadId ?? null,
      });
      logged = true;
    } catch (err) {
      console.error("CRITICAL: メール送信は成功したが送信履歴の記録に失敗:", {
        prospectId: p.prospectId,
        toEmail: p.toEmail,
        attempt,
        error: err,
      });
    }
  }
  if (!logged) {
    // 送信履歴が無いと hasSentToEmail が将来この宛先を素通しし二重送信になる。
    // 実宛先を抑止リストに入れ、次回以降の送信を確実にブロックする（人手で解除するまで）。
    try {
      addSuppression({
        target: p.realToEmail,
        target_type: "email",
        reason: "manual",
        note: "送信は成功したが送信履歴の記録に失敗したため、二重送信防止として自動登録",
      });
    } catch (supErr) {
      console.error("送信履歴記録失敗後の抑止リスト登録にも失敗:", {
        realToEmail: p.realToEmail,
        error: supErr,
      });
    }
    warnings.push(
      "送信は完了しましたが送信履歴の記録に失敗しました。重複送信防止のためこの宛先を送信ブロック対象に追加しました（手動で再送しないでください）"
    );
  }

  let statusSet = false;
  for (let attempt = 0; attempt < 2 && !statusSet; attempt++) {
    try {
      updateProspectStatus(p.prospectId, "sent");
      statusSet = true;
    } catch (err) {
      console.error("メール送信は成功したが status 更新に失敗:", {
        prospectId: p.prospectId,
        attempt,
        error: err,
      });
    }
  }
  if (!statusSet) {
    warnings.push(
      "送信は完了しましたが送信状態の記録に失敗しました。履歴で未送信と表示される場合があります（手動で再送しないでください）"
    );
  }

  return { warnings };
}
