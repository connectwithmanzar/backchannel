// Minimal Gmail API client using OAuth (no extra libraries).
const TOKEN_URL = "https://oauth2.googleapis.com/token";
import { decryptSecret } from "@/lib/crypto";
import { fromAddress, isAutoReply, isBounceMessage, isDelayNotice } from "./limits";
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
  return (await tokenRequest({ refresh_token: decryptSecret(refreshToken), grant_type: "refresh_token" })).access_token;
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

export type ThreadState = { reply: boolean; bounce: boolean };

/** Reads who has written in a thread: a human reply, or a delivery-failure notice (a bounce). */
export async function threadState(token: string, threadId: string, myEmail: string): Promise<ThreadState> {
  const t = await gmailGet(token, `/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
  const state: ThreadState = { reply: false, bounce: false };
  for (const m of (t.messages ?? []) as { payload?: { headers?: { name: string; value: string }[] } }[]) {
    const header = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
    const from = header("from");
    const subject = header("subject");
    if (!from || fromAddress(from) === myEmail.trim().toLowerCase()) continue;
    if (isBounceMessage(from, subject)) state.bounce = true;
    else if (isDelayNotice(subject) || isAutoReply(subject)) continue;
    else state.reply = true;
  }
  return state;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

/** Plain text of a message, without the quoted copy of your own earlier email. */
export function extractReplyText(payload: Part | undefined, snippet = ""): string {
  const find = (p: Part | undefined): string | null => {
    if (!p) return null;
    if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const child of p.parts ?? []) { const t = find(child); if (t) return t; }
    return null;
  };
  const text = (find(payload) ?? snippet).replace(/\r\n/g, "\n");
  const cut = text.search(/^On .{5,120}wrote:\s*$/m);
  const own = (cut > 0 ? text.slice(0, cut) : text).split("\n").filter((l) => !l.trim().startsWith(">")).join("\n");
  return own.trim().slice(0, 4000);
}

export interface ThreadReply { from: string; date: string; text: string }

/** What other people wrote in a thread (replies only, not bounce notices). */
export async function threadReplies(token: string, threadId: string, myEmail: string): Promise<ThreadReply[]> {
  const t = await gmailGet(token, `/threads/${threadId}?format=full`);
  const out: ThreadReply[] = [];
  for (const m of (t.messages ?? []) as { snippet?: string; payload?: Part & { headers?: { name: string; value: string }[] } }[]) {
    const header = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
    const from = header("from");
    if (!from || fromAddress(from) === myEmail.trim().toLowerCase() || isBounceMessage(from, header("subject")) || isDelayNotice(header("subject"))) continue;
    out.push({ from, date: header("date"), text: extractReplyText(m.payload, m.snippet) });
  }
  return out;
}

export interface InboxItem { id: string; threadId: string; from: string; subject: string; date: string; snippet: string }

/** Recent inbox messages matching a Gmail search (read only, headers and a short snippet). */
export async function listInbox(token: string, query: string, max = 40): Promise<InboxItem[]> {
  const list = await gmailGet(token, `/messages?${new URLSearchParams({ q: query, maxResults: String(max) })}`);
  const ids = ((list.messages ?? []) as { id: string }[]).map((m) => m.id);
  const out: InboxItem[] = [];
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(ids.slice(i, i + 8).map((id) => gmailGet(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`).catch(() => null)));
    for (const m of batch) {
      if (!m) continue;
      const header = (n: string) => (m.payload?.headers as { name: string; value: string }[] | undefined)?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
      out.push({ id: m.id, threadId: m.threadId, from: header("from"), subject: header("subject"), date: header("date"), snippet: String(m.snippet ?? "") });
    }
  }
  return out;
}

/** What other people wrote in the given threads, newest messages included. Used for replies to emails Backchannel sent. */
export async function repliesInThreads(token: string, threadIds: string[], myEmail: string): Promise<InboxItem[]> {
  const me = myEmail.trim().toLowerCase();
  const out: InboxItem[] = [];
  for (let i = 0; i < threadIds.length; i += 8) {
    const batch = await Promise.all(threadIds.slice(i, i + 8).map((id) => gmailGet(token, `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`).catch(() => null)));
    for (const t of batch) {
      for (const m of (t?.messages ?? []) as { id: string; threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } }[]) {
        const header = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
        const from = header("from");
        const subject = header("subject");
        if (!from || fromAddress(from) === me || isBounceMessage(from, subject) || isDelayNotice(subject) || isAutoReply(subject)) continue;
        out.push({ id: m.id, threadId: m.threadId, from, subject, date: header("date"), snippet: String(m.snippet ?? "") });
      }
    }
  }
  return out;
}
