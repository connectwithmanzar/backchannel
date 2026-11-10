import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { aiJson, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { scoreForUser } from "@/lib/jobs/scoring";
import { buildPastedJob } from "@/lib/jobs/paste";
import { isSalesRole } from "@/lib/jobs/process";
import { validAlertListings, type AlertListing } from "@/lib/jobs/alert-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You read a pasted job-alert email and list the jobs it names. Return only what the text states; never guess or invent. ${DATA_NOTICE}
Return JSON: {"jobs": [{"title": string, "company": string, "location": string, "url": string}]}.
"url" must be copied exactly from the text, character for character. Skip any job without a link in the text.`;

// POST /api/jobs/alert-import { text }: saves the jobs named in a pasted alert email, for the signed-in user only.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimitShared(`alert-import:${user.id}`, 20, 3600_000))) {
    return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`alert-import:${user.id}`)}s.` }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 40_000) : "";
  if (text.length < 80) return NextResponse.json({ error: "Paste the whole alert email (at least a few lines)." }, { status: 400 });
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });

  let listings: AlertListing[];
  try {
    const x = await aiJson<{ jobs?: unknown }>(SYSTEM, `ALERT EMAIL:\n${untrusted("alert_email", text.slice(0, 30_000))}`, { maxTokens: 3000, fast: true });
    listings = validAlertListings(x.jobs, text);
  } catch (e) {
    console.error("alert-import: read failed:", (e as Error).message);
    return NextResponse.json({ error: "Couldn't read that email. Try pasting it again." }, { status: 422 });
  }
  if (!listings.length) return NextResponse.json({ error: "I found no jobs with links in that text. Copy the email from Gmail with its links and paste again." }, { status: 422 });

  const svc = serviceClient();
  const rows = [];
  let skipped = 0;
  for (const l of listings) {
    if (!isSalesRole(l.title) || isExcludedCompany(l.company, l.url) || (await isBlocked(db, user.id, "", l.company))) { skipped++; continue; }
    rows.push(buildPastedJob(user.id, l, `${l.title} at ${l.company}, ${l.location}. Listed in your job alert email; open the link for the full posting.`, l.url));
  }
  if (rows.length) {
    const { error } = await svc.from("jobs").upsert(rows, { onConflict: "dedupe_hash" });
    if (error) {
      console.error("alert-import: save failed:", error.message);
      return NextResponse.json({ error: "Couldn't save those jobs." }, { status: 500 });
    }
    await scoreForUser(svc, user.id, { deadline: Date.now() + 25_000, ai: false });
  }
  return NextResponse.json({ ok: true, added: rows.length, skipped, found: listings.length });
}
