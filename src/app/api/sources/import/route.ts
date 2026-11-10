import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isOwner } from "@/lib/owner";
import { discoverBoard } from "@/lib/collectors/ats";
import { runIngestion } from "@/lib/jobs/ingest";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { SHARED_JOBS_TAG } from "@/lib/jobs/shared-cache";
import { cleanDomain } from "@/lib/contacts/apollo";
import { IMPORT_BATCH } from "@/lib/company-import";
import { cleanExtra, type CompanyExtra } from "@/lib/clay-import";

export const runtime = "nodejs";
export const maxDuration = 120;

type Outcome = { name: string; status: "added" | "no_feed" | "already_there" | "excluded"; ats?: string; roles?: number };

// POST /api/sources/import { companies: [{ name, domain }] } adds up to IMPORT_BATCH companies per call and collects their roles.
export async function POST(req: NextRequest) {
  const uc = await createClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Only the owner can change sources." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const input = Array.isArray(body.companies) ? body.companies.slice(0, IMPORT_BATCH) : [];
  if (!input.length) return NextResponse.json({ error: "No companies to add." }, { status: 400 });

  const svc = serviceClient();
  const { data: existing } = await svc.from("companies").select("id, name, domain");
  const idByName = new Map((existing ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));
  const idByDomain = new Map((existing ?? []).filter((c: { domain: string | null }) => c.domain).map((c: { id: string; domain: string | null }) => [c.domain as string, c.id]));
  const haveName = new Set((existing ?? []).map((c: { name: string }) => c.name.toLowerCase()));
  const haveDomain = new Set((existing ?? []).map((c: { domain: string | null }) => c.domain).filter(Boolean));

  const outcomes: Outcome[] = [];
  const addedIds: string[] = [];
  const queue = input.map((c: { name?: unknown; domain?: unknown; extra?: unknown }) => ({
    name: String(c.name ?? "").trim().slice(0, 120),
    domain: typeof c.domain === "string" ? cleanDomain(c.domain) : null,
    extra: c.extra ? cleanExtra(c.extra) : null,
  })).filter((c: { name: string }) => c.name);

  // The newer columns arrive with migration 0014; until it is run this quietly does nothing and the import still works.
  async function saveExtra(id: string, x: CompanyExtra | null) {
    if (!x) return;
    const { error } = await svc.from("companies").update({ linkedin_url: x.linkedin_url, company_type: x.company_type, hiring_signal: x.hiring_signal, linkedin_openings: x.linkedin_openings }).eq("id", id);
    if (error && !/column/i.test(error.message)) console.error("import: enrichment save failed:", error.message);
  }

  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      if (isExcludedCompany(c.name, c.domain) || (await isBlocked(uc, user!.id, "", c.name))) { outcomes.push({ name: c.name, status: "excluded" }); continue; }
      if (haveName.has(c.name.toLowerCase()) || (c.domain && haveDomain.has(c.domain))) {
        const id = (c.domain && idByDomain.get(c.domain)) || idByName.get(c.name.toLowerCase());
        if (id) await saveExtra(id, c.extra);
        outcomes.push({ name: c.name, status: "already_there" }); continue;
      }
      const found = await discoverBoard(c.name, c.domain).catch(() => null);
      const row: Record<string, string | boolean | null> = { name: c.name, domain: c.domain, enabled: true, country: c.extra?.country ?? null, hq: c.extra?.hq ?? null, size: c.extra?.size ?? null, sector: c.extra?.sector ?? null };
      if (found) { row.ats_type = found.ats; row.ats_slug = found.slug; }
      const { data, error } = await svc.from("companies").insert(row).select("id").single();
      if (error || !data) { outcomes.push({ name: c.name, status: found ? "already_there" : "no_feed" }); continue; }
      await saveExtra(data.id, c.extra);
      haveName.add(c.name.toLowerCase());
      if (c.domain) haveDomain.add(c.domain);
      if (found) { addedIds.push(data.id); outcomes.push({ name: c.name, status: "added", ats: found.ats, roles: found.jobs }); }
      else outcomes.push({ name: c.name, status: "no_feed" });
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  let salesRoles = 0;
  if (addedIds.length) {
    const run = await runIngestion({ companyIds: addedIds, repair: false });
    salesRoles = run.sales_roles;
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
  }
  return NextResponse.json({ ok: true, outcomes, sales_roles: salesRoles });
}
