/**
 * A方針の検証: 本物の runSendGuard を実DB(一時ディレクトリ)で叩き、
 * force でも本人由来の抑止はブロックされ、AI誤検知(refusal_detected)だけ
 * 押し切れることを確認する。npx tsx で実行。
 */
import { runSendGuard } from "@/lib/send-guard";
import { upsertSender, addSuppression } from "@/lib/db";
import type { SuppressionReason } from "@/lib/types";

// 署名あり・変数残りなしの正常な本文（抑止以外の警告を出さないため）
const BODY = "本文です。\n━━━━━━━━\n株式会社テスト 営業部\n配信停止はこちら";
const SUBJECT = "ご提案の件";

const sender = upsertSender({
  email: "sales@example.co.jp",
  display_name: "テスト太郎",
  google_refresh_token_encrypted: "dummy",
});

let pass = 0;
let fail = 0;
function check(label: string, got: boolean, want: boolean) {
  const ok = got === want;
  console.log(`${ok ? "✅" : "❌"} ${label} : canSend=${got} (期待=${want})`);
  ok ? pass++ : fail++;
}

function guard(toEmail: string, force: boolean): boolean {
  return runSendGuard({ toEmail, subject: SUBJECT, body: BODY, senderId: sender.id, force }).canSend;
}

// 1. 抑止なし → 送れる（forceなし）
check("抑止なし・forceなし", guard("clean@target.co.jp", false), true);

// 2. 本人由来の抑止(optout) → forceでもブロック
addSuppression({ target: "optout@target.co.jp", target_type: "email", reason: "optout" });
check("optout・forceなし → ブロック", guard("optout@target.co.jp", false), false);
check("optout・force=true → それでもブロック", guard("optout@target.co.jp", true), false);

// 3. bounce / rejected_reply / manual も force で送れないこと
for (const reason of ["bounce", "rejected_reply", "manual"] as SuppressionReason[]) {
  addSuppression({ target: `${reason}@target.co.jp`, target_type: "email", reason });
  check(`${reason}・force=true → ブロック`, guard(`${reason}@target.co.jp`, true), false);
}

// 4. AI誤検知(refusal_detected) → forceなしはブロック、force=trueなら送れる
addSuppression({ target: "refusal@target.co.jp", target_type: "email", reason: "refusal_detected" });
check("refusal_detected・forceなし → ブロック", guard("refusal@target.co.jp", false), false);
check("refusal_detected・force=true → 送れる(誤検知救済)", guard("refusal@target.co.jp", true), true);

// 5. ドメイン単位の抑止も force で送れないこと
addSuppression({ target: "blocked-domain.jp", target_type: "domain", reason: "optout" });
check("ドメインoptout・force=true → ブロック", guard("anyone@blocked-domain.jp", true), false);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
