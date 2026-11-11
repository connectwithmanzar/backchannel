import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { isCronAuthorized, ownerEmail } from "@/lib/owner";
import { rateLimitShared } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { scoreForUser } from "@/lib/jobs/scoring";
import { buildPastedJob } from "@/lib/jobs/paste";
import { isSalesRole } from "@/lib/jobs/process";
import { discoverBoard } from "@/lib/collectors/ats";
import { validJobRadarListings, uniqueCompanies, SITE_NAMES } from "@/lib/jobs/jobradar";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/jobs/jobradar-import  (Authorization: Bearer JOBRADAR_SECRET)
// { jobs: [{ title, company, location, url, site, description? }], add_companies?: boolean }
// Saves the jobs as the owner's private jobs and, if asked, adds their companies to Sources
// when a public Greenhouse, Lever, Ashby or SmartRecruiters board is found.
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.JOBRADAR_SECRET)) {
    return NextResponse.json({ error: "Wrong or missing JobRadar key. Copy JOBRADAR_SECRET from Vercel into JobRadar." }, { status: 403 });
  }
  if (!(await rateLimitShared("jobradar-import", 30, 3600_000))) {
    return NextResponse.json({ error: "Too many sends in an hour. Try again later." }, { status: 429 });
  }
  const svc = serviceClient();
  const owner = ownerEmail();
  const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const me = (users ?? []).find((u) => (u.email ?? "").toLowerCase() === owner);
  if (!me) return NextResponse.json({ error: "Sign in to Backchannel once with the owner email, then send again." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const listings = validJobRadarListings(body.jobs);
  if (!listings.length) return NextResponse.json({ error: "No valid jobs were sent (each needs a title, company and https link)." }, { status: 400 });

  const rows = [];
  const skipped: { title: string; company: string; reason: string }[] = [];
  for (const l of listings) {
    if (isExcludedCompany(l.company, l.url) || (await isBlocked(svc, me.id, "", l.company))) { skipped.push({ title: l.title, company: l.company, reason: "excluded or blocklisted company" }); continue; }
    if (!isSalesRole(l.title)) { skipped.push({ title: l.title, company: l.company, reason: "not a sales role Backchannel tracks" }); continue; }
    const text = l.description || `${l.title} at ${l.company}, ${l.location}. Found by JobRadar on ${SITE_NAMES[l.site]}; open the link for the full posting.`;
    rows.push({ ...buildPastedJob(me.id, l, text, l.url), source: `jobradar:${l.site}` });
  }
  if (rows.length) {
    const { error } = await svc.from("jobs").upsert(rows, { onConflict: "dedupe_hash" });
    if (error) {
      console.error("jobradar-import: save failed:", error.message);
      return NextResponse.json({ error: "Couldn't save those jobs." }, { status: 500 });
    }
    await scoreForUser(svc, me.id, { deadline: Date.now() + 25_000, ai: false });
  }

  // Company discovery: track each hiring company's official board, so Backchannel collects its jobs itself.
  const companies = { added: [] as string[], already: [] as string[], no_board: [] as string[] };
  if (body.add_companies === true) {
    const deadline = Date.now() + 60_000;
    const names = uniqueCompanies(listings.filter((l) => !isExcludedCompany(l.company, l.url)));
    for (const name of names) {
      if (Date.now() > deadline) break;
      const { data: known } = await svc.from("companies").select("id").ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
      if (known) { companies.already.push(name); continue; }
      const found = await discoverBoard(name).catch(() => null);
      if (!found) { companies.no_board.push(name); continue; }
      const { error } = await svc.from("companies").upsert(
        { name, ats_type: found.ats, ats_slug: found.slug, enabled: true },
        { onConflict: "ats_type,ats_slug" },
      );
      if (error) companies.no_board.push(name); else companies.added.push(name);
    }
  }

  return NextResponse.json({ ok: true, added: rows.length, skipped, companies });
}
