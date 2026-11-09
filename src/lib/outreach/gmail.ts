// Minimal Gmail API client using OAuth (no extra libraries).
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];

export function gmailConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function authUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GMAIL_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google sign-in failed: ${data.error_description ?? data.error ?? res.status}`);
  return data as { access_token: string; refresh_token?: string };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token. Remove Backchannel from your Google account's third-party access and connect again.");
  const profile = await gmailGet(t.access_token, "/profile");
  return { refreshToken: t.refresh_token, email: profile.emailAddress as string };
}

export async function accessToken(refreshToken: string) {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token;
}

async function gmailGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail error: ${data.error?.message ?? res.status}`);
  return data;
}

function encodeHeader(v: string) {
  return /[^\x20-\x7e]/.test(v) ? `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=` : v;
}

export function buildMime(o: { from: string; to: string; subject: string; body: string; inReplyTo?: string }) {
  const lines = [
    `From: ${o.from}`, `To: ${o.to}`, `Subject: ${encodeHeader(o.subject)}`,
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64",
  ];
  if (o.inReplyTo) lines.push(`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`);
  const raw = `${lines.join("\r\n")}\r\n\r\n${Buffer.from(o.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n")}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

export async function sendEmail(token: string, o: { from: string; to: string; subject: string; body: string; threadId?: string | null }) {
  let inReplyTo: string | undefined;
  if (o.threadId) {
    const t = await gmailGet(token, `/threads/${o.threadId}?format=metadata&metadataHeaders=Message-ID`);
    const last = t.messages?.[t.messages.length - 1];
    inReplyTo = last?.payload?.headers?.find((h: { name: string }) => h.name.toLowerCase() === "message-id")?.value;
  }
  const res = await fetch(`${API}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildMime({ ...o, inReplyTo }), ...(o.threadId ? { threadId: o.threadId } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail send failed: ${data.error?.message ?? res.status}`);
  return { id: data.id as string, threadId: data.threadId as string };
}

/** True when anyone other than the sender has written in the thread. */
export async function threadHasReply(token: string, threadId: string, myEmail: string) {
  const t = await gmailGet(token, `/threads/${threadId}?format=metadata&metadataHeaders=From`);
  return (t.messages ?? []).some((m: { payload?: { headers?: { name: string; value: string }[] } }) => {
    const from = m.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
    return from && !from.toLowerCase().includes(myEmail.toLowerCase());
  });
}
