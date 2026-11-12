import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { aiJson, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { scoreForUser } from "@/lib/jobs/scoring";
import { buildPastedJob, parseJobUrl } from "@/lib/jobs/paste";
import { fetchListing, type Listing } from "@/lib/jobs/fetch-listing";
import { canonicalUrl } from "@/lib/jobs/url";

export const runtime = "nodejs";
export const maxDuration = 60;

type Extracted = { title?: string | null; company?: string | null; location?: string | null };

const SYSTEM = `You read a pasted job post and return only what it states. Never guess or invent. ${DATA_NOTICE}
Return JSON: {"title": string|null, "company": string|null, "location": string|null}.
"location" is the place or work arrangement as written (e.g. "Remote, India" or "Dubai, UAE"). Use null for anything the text does not say.`;

// POST /api/jobs/paste { url?, text?, title?, company?, location? }: saves a job for the signed-in user only.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimitShared(`paste:${user.id}`, 40, 3600_000))) {
    return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`paste:${user.id}`)}s.` }, { status: 429 });
  }

  const b = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  let text = str(b.text, 20_000);
  let url: string | null = null;
  let fetched: Listing | null = null;

  if (b.url) {
    const parsed = parseJobUrl(String(b.url));
    if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });
    url = canonicalUrl(parsed.url);
    if (!text) {
      // Owner decision (12 Nov 2026): a pasted link from any board is opened once, as a public page, without a login.
      const got = await fetchListing(parsed.url);
      if (got.listing.text.length < 80) {
        return NextResponse.json({ error: "That site didn't show me the job description. Paste the job text next to the link and I'll do the rest." }, { status: 422 });
      }
      fetched = got.listing;
      text = got.listing.text;
    }
  }
  if (text.length < 80) return NextResponse.json({ error: "Paste the job text (at least a few lines), or a link to a public careers page." }, { status: 400 });

  let title = str(b.title, 200) || fetched?.title || "", company = str(b.company, 200) || fetched?.company || "", location = str(b.location, 200) || fetched?.location || "";
  if (!title || !company) {
    if (!hasAIKey()) return NextResponse.json({ error: `${NO_AI_MESSAGE} Or fill in the title and company yourself.` }, { status: 503 });
    try {
      const x = await aiJson<Extracted>(SYSTEM, `JOB POST:\n${untrusted("job_post", text.slice(0, 8000))}`, { maxTokens: 300, fast: true });
      title = title || (x.title ?? "").trim();
      company = company || (x.company ?? "").trim();
      location = location || (x.location ?? "").trim();
    } catch {
      return NextResponse.json({ error: "Couldn't read that post. Fill in the title and company and try again." }, { status: 422 });
    }
  }
  if (!title || !company) return NextResponse.json({ error: "I couldn't find the job title and company. Please fill them in." }, { status: 422 });

  if (isExcludedCompany(company, url) || (await isBlocked(db, user.id, "", company))) {
    return NextResponse.json({ error: `${company} is on your stealth or excluded list, so it won't be added.` }, { status: 400 });
  }

  const svc = serviceClient();
  const row = buildPastedJob(user.id, { title, company, location: location || "Not stated" }, text, url);
  const { data: saved, error } = await svc.from("jobs").upsert(row, { onConflict: "dedupe_hash" }).select("id").single();
  if (error) {
    console.error("paste-job: save failed:", error.message);
    return NextResponse.json({ error: "Couldn't save that job. If this keeps happening, the latest database update may not have been run." }, { status: 500 });
  }

  await scoreForUser(svc, user.id, { deadline: Date.now() + 20_000, ai: false });
  const { data: sc } = await svc.from("job_scores").select("score").eq("user_id", user.id).eq("job_id", saved.id).maybeSingle();
  return NextResponse.json({ ok: true, job_id: saved.id, title, company, score: sc?.score ?? null });
}

// DELETE /api/jobs/paste?id=... removes a job this user pasted. Shared jobs can never be deleted here.
export async function DELETE(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  const { data, error } = await serviceClient().from("jobs").delete().eq("id", id).eq("added_by", user.id).or("source.eq.pasted,source.like.jobradar:*").select("id");
  if (error) return NextResponse.json({ error: "Couldn't remove that job." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "That job isn't one you added." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
