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
