import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { fetchListing } from "@/lib/jobs/fetch-listing";
import { classifyRelevance } from "@/lib/relevance";
import { canonicalUrl } from "@/lib/jobs/url";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/jobs/fetch-link { url }: reads one job page the owner pasted and returns what it found. Nothing is saved.
// The page is opened without logging in, one link per request. Saving is a separate step (POST /api/jobs/paste).
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimitShared(`fetchlink:${user.id}`, 30, 3600_000))) {
    return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`fetchlink:${user.id}`)}s.` }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const link = typeof b.url === "string" ? b.url.trim().slice(0, 1500) : "";
  if (!link) return NextResponse.json({ error: "Paste a job link first." }, { status: 400 });

  const got = await fetchListing(link);
  const l = got.listing;
  if (isExcludedCompany(l.company, link)) return NextResponse.json({ error: "That company is on your never-contact list, so it won't be added." }, { status: 400 });

  const url = got.ok || l.title || l.company ? canonicalUrl(link) : link;
  const relevance = l.title ? classifyRelevance(l.title, l.company ?? "", l.text) : null;
  const haveText = l.text.length >= 80;
  const note = !got.ok
    ? `${got.reason} ${l.title || l.company ? "I filled in what the link itself says. " : ""}Paste the job text below.`
    : haveText ? "Read from the page. Check it, then save."
    : "The site didn't show the job description. I filled in what I could; paste the job text to finish.";
  return NextResponse.json({
    ok: true, url, blocked: l.blocked || !haveText,
    title: l.title, company: l.company, location: l.location, text: l.text, from: l.from, note,
    relevant: relevance?.relevant ?? null, relevance_reason: relevance?.reason ?? null,
  });
}
