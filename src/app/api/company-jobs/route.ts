import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isOwner } from "@/lib/owner";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { discoverBoard } from "@/lib/collectors/ats";
import { runIngestion } from "@/lib/jobs/ingest";
import { cleanDomain } from "@/lib/contacts/apollo";
import { jsearchConfigured, listingsForCompany, searchJSearch } from "@/lib/collectors/jsearch";
import { probeCareersSite, resolveDomain, searchCompanyBoards, searchCompanyRoles } from "@/lib/jobs/company-finder";
import { webSearchConfigured } from "@/lib/websearch";
import { SHARED_JOBS_TAG } from "@/lib/jobs/shared-cache";

export const runtime = "nodejs";
export const maxDuration = 90;

type Role = { title: string; location: string; url: string };

// POST /api/company-jobs { name, website? }: finds a company's open sales roles by every route we have.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimitShared(`cjobs:${user.id}`, 20, 3600_000))) {
    return NextResponse.json({ error: `Slow down a little. Try again in ${retryAfter(`cjobs:${user.id}`)}s.` }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const place = String(b.location ?? "").replace(/[^\p{L}\p{N}\s,.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const name = String(b.name ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (name.length < 2) return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
  let domain = typeof b.website === "string" && b.website.trim() ? cleanDomain(b.website) : null;
  if (isExcludedCompany(name, domain) || (await isBlocked(db, user.id, "", name))) {
    return NextResponse.json({ error: `${name} is on your stealth or excluded list, so I won't look for roles there.` }, { status: 400 });
  }

  const svc = serviceClient();
  const owner = isOwner(user.email);
  const rolesOf = async (companyId: string): Promise<Role[]> => {
    const { data } = await svc.from("jobs").select("title, location, url").eq("company_id", companyId).eq("is_active", true).is("added_by", null).limit(25);
    return (data ?? []).map((j) => ({ title: j.title, location: j.location ?? "", url: j.url ?? "" }));
  };
  const addBoard = async (ats: string, slug: string) => {
    const { data, error } = await svc.from("companies").upsert({ name, domain, ats_type: ats, ats_slug: slug, enabled: true }, { onConflict: "ats_type,ats_slug" }).select("id").single();
    if (error || !data) return null;
    await runIngestion({ companyIds: [data.id], repair: false });
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return { id: data.id, roles: await rolesOf(data.id) };
  };

  // 1. Already watched: refresh it and show what is there.
  const { data: have } = await svc.from("companies").select("id").ilike("name", name).not("ats_slug", "is", null).limit(1).maybeSingle();
  if (have && owner) {
    await runIngestion({ companyIds: [have.id], repair: true });
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, status: "board", how: "already watched", name, roles: await rolesOf(have.id) });
  }

  // 2. Guess the company's board on the four main job systems.
  if (!domain && webSearchConfigured()) domain = await resolveDomain(name);
  const guessed = await discoverBoard(name, domain).catch(() => null);
  if (guessed && owner) {
    const r = await addBoard(guessed.ats, guessed.slug);
    if (r) return NextResponse.json({ ok: true, status: "board", how: `found on ${guessed.ats}`, name, roles: r.roles });
  }

  // 3. Read the company's own careers page to see which job system it links to.
  let workday: string | null = null;
  if (domain) {
    const probe = await probeCareersSite(domain);
    workday = probe.workday;
    if (owner) {
      for (const f of probe.boards) {
        const r = await addBoard(f.ats, f.slug);
        if (r && r.roles.length) return NextResponse.json({ ok: true, status: "board", how: `found through their careers page (${f.ats})`, name, roles: r.roles });
      }
    }
  }

  // 4. Search the job systems themselves for the company name: one result reveals the whole board.
  if (owner && webSearchConfigured()) {
    for (const f of await searchCompanyBoards(name).catch(() => [])) {
      const r = await addBoard(f.ats, f.slug);
      if (r && r.roles.length) return NextResponse.json({ ok: true, status: "board", how: `found through search (${f.ats})`, name, roles: r.roles });
    }
  }

  // 5. Real listings from a licensed Google-for-Jobs feed, when its key is set. A failure here must not stop the search:
  // the note is kept and the next route is still tried.
  let listingsNote = "";
  if (jsearchConfigured()) {
    // The free plan has a hard limit of 200 requests a month: 100 for your searches, 80 for the daily scan, 20 spare.
    if (!(await rateLimitShared(`jsearch:${user.id}`, 100, 30 * 864e5))) {
      listingsNote = "You've used this month's job-listing searches.";
    } else {
      try {
        const cards = await searchJSearch(`sales jobs at ${name}${place ? ` in ${place}` : ""}`);
        const { shown, hidden } = listingsForCompany(cards, name);
        if (shown.length) return NextResponse.json({ ok: true, status: "listings", name, listings: shown.slice(0, 25), hidden });
      } catch (e) { listingsNote = (e as Error).message; }
    }
  }

  // 6. Individual posting pages on their site and the main job boards (category and landing pages are dropped).
  if (webSearchConfigured()) {
    const results = await searchCompanyRoles(name, domain).catch(() => []);
    if (results.length) return NextResponse.json({ ok: true, status: "results", name, domain, workday, results });
  }
  return NextResponse.json({ ok: true, status: "none", name, domain, workday, careersUrl: domain ? `https://${domain}/careers` : null, ...(listingsNote ? { note: listingsNote } : {}) });
}
