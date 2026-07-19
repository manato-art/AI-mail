import { isEmailSuppressed, hasSentToEmail, getTodaySendCount, getSender } from "@/lib/db";
import type { SendGuardResult } from "@/lib/types";

const UNRESOLVED_VARIABLE_PATTERN = /\{\{[^}]+\}\}/g;

const OWN_DOMAINS = (process.env.OWN_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function checkUnresolvedVariables(subject: string, body: string): string[] {
  const subjectMatches = subject.match(UNRESOLVED_VARIABLE_PATTERN) ?? [];
  const bodyMatches = body.match(UNRESOLVED_VARIABLE_PATTERN) ?? [];
  return [...subjectMatches, ...bodyMatches];
}

export function checkOwnDomainBlock(toEmail: string): boolean {
  const domain = toEmail.toLowerCase().split("@")[1];
  return OWN_DOMAINS.includes(domain);
}

export function checkSignaturePresent(body: string): boolean {
  return body.includes("━━━") || body.includes("---");
}

export function runSendGuard(params: {
  toEmail: string;
  subject: string;
  body: string;
  senderId: number;
  prospectId: number;
}): SendGuardResult {
  const reasons: string[] = [];

  const suppression = isEmailSuppressed(params.toEmail);
  if (suppression) {
    reasons.push(
      `送信抑止リストに登録されています（理由: ${suppression.reason}、対象: ${suppression.target}）`
    );
  }

  const unresolvedVars = checkUnresolvedVariables(params.subject, params.body);
  if (unresolvedVars.length > 0) {
    reasons.push(
      `未解決の変数が残っています: ${unresolvedVars.join(", ")}`
    );
  }

  if (checkOwnDomainBlock(params.toEmail)) {
    reasons.push("自社・グループドメイン宛ての送信はブロックされています");
  }

  if (!checkSignaturePresent(params.body)) {
    reasons.push("署名ブロックが検出されません（特定電子メール法の表示義務）");
  }

  if (hasSentToEmail(params.toEmail)) {
    reasons.push("このアドレスには既に送信済みです（二重送信防止）");
  }

  const sender = getSender(params.senderId);
  if (!sender) {
    reasons.push("送信者アカウントが見つかりません");
  } else {
    if (sender.auth_status !== "connected") {
      reasons.push(`送信者アカウントの認証状態が無効です（${sender.auth_status}）`);
    }
    if (sender.daily_limit > 0) {
      const todayCount = getTodaySendCount(params.senderId);
      if (todayCount >= sender.daily_limit) {
        reasons.push(
          `本日の送信上限に達しています（${todayCount}/${sender.daily_limit}通）`
        );
      }
    }
  }

  if (!params.subject.trim()) {
    reasons.push("件名が空です");
  }

  if (!params.body.trim()) {
    reasons.push("本文が空です");
  }

  return {
    canSend: reasons.length === 0,
    reasons,
  };
}
