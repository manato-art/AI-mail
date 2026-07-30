import { google } from "googleapis";
import MailComposer from "nodemailer/lib/mail-composer";
import { decrypt } from "@/lib/crypto";

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/gmail/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state?: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: state ?? "",
  });
}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  email: string;
  displayName: string;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("No refresh token received. Please revoke access and try again.");
  }

  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress ?? "";

  const people = google.people({ version: "v1", auth: oauth2Client });
  let displayName = "";
  try {
    const me = await people.people.get({
      resourceName: "people/me",
      personFields: "names",
    });
    displayName = me.data.names?.[0]?.displayName ?? "";
  } catch {
    displayName = email.split("@")[0];
  }

  return {
    refreshToken: tokens.refresh_token,
    email,
    displayName,
  };
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailParams {
  encryptedRefreshToken: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  unsubscribeEmail: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
}

/** Gmail 側に残っている実物のメールから読み取った控え（こちらのDBとは独立した事実） */
export interface SentMessageProof {
  /** Gmail が記録した受理時刻（UTCミリ秒）。こちらの sent_at と突き合わせる */
  internalDateMs: number | null;
  /** Gmail 側のヘッダ実物 */
  to: string | null;
  subject: string | null;
  dateHeader: string | null;
  /** SENT ラベルが付いているか＝送信済みトレイに存在するか */
  labelIds: string[];
  threadId: string | null;
}

/**
 * 記録した gmail_message_id で Gmail の実物を引き、送信の裏を取る。
 *
 * 「送信済み」表示がこちらのDBだけを根拠にしていると、記録漏れ・手動書き換えを
 * 見分けられない。Gmail 側の internalDate とヘッダを持ってきて突き合わせる。
 * 権限は既存の gmail.modify（読み取りを含む）で足りるので再認証は不要。
 */
export async function fetchSentMessageProof(
  encryptedRefreshToken: string,
  messageId: string
): Promise<SentMessageProof> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: decrypt(encryptedRefreshToken) });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    const res = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["To", "Subject", "Date"],
    });
    const headers = res.data.payload?.headers ?? [];
    const headerOf = (name: string) =>
      headers.find((h) => (h.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? null;
    return {
      internalDateMs: res.data.internalDate ? Number(res.data.internalDate) : null,
      to: headerOf("To"),
      subject: headerOf("Subject"),
      dateHeader: headerOf("Date"),
      labelIds: res.data.labelIds ?? [],
      threadId: res.data.threadId ?? null,
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string }; status?: number } };
    const status = error.response?.status;
    if (status === 401 || error.response?.data?.error === "invalid_grant") {
      throw new Error("REAUTH_REQUIRED");
    }
    if (status === 404) {
      throw new Error("MESSAGE_NOT_FOUND");
    }
    throw new Error("Gmail API get failed");
  }
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const oauth2Client = getOAuth2Client();
  const refreshToken = decrypt(params.encryptedRefreshToken);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const mail = new MailComposer({
    from: params.fromName
      ? `${params.fromName} <${params.from}>`
      : params.from,
    to: params.to,
    subject: params.subject,
    text: params.body,
    attachments: params.attachments,
    headers: {
      "List-Unsubscribe": `<mailto:${params.unsubscribeEmail}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  const message = await mail.compile().build();
  const raw = message
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return {
      messageId: res.data.id ?? "",
      threadId: res.data.threadId ?? "",
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string }; status?: number } };
    if (error.response?.status === 401 || error.response?.data?.error === "invalid_grant") {
      throw new Error("REAUTH_REQUIRED");
    }
    throw new Error("Gmail API send failed");
  }
}
