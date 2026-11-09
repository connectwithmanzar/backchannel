import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isOwner } from "@/lib/owner";
import { discoverBoard } from "@/lib/collectors/ats";
import { runIngestion } from "@/lib/jobs/ingest";
import { isExcludedCompany } from "@/data/companies";
import { revalidateTag } from "next/cache";
import { SHARED_JOBS_TAG } from "@/lib/jobs/shared-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/sources — manage the company boards Backchannel collects from.
// { action: "add", name, domain? } | { action: "toggle", id, enabled } | { action: "repair", id } | { action: "run", id }
export async function POST(req: NextRequest) {
  const uc = await createClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Only the owner can change sources." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const svc = serviceClient();

  if (body.action === "add") {
    const name = String(body.name ?? "").trim();
    const domain = body.domain ? String(body.domain).trim() : null;
    if (!name) return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
    if (isExcludedCompany(name, domain)) return NextResponse.json({ error: `${name} is on your excluded list.` }, { status: 400 });
    const found = await discoverBoard(name, domain);
    if (!found) {
      return NextResponse.json({
        error: `Couldn't find a public Greenhouse, Lever, Ashby or SmartRecruiters board for ${name}. They may use Workday or their own site, which isn't supported yet.`,
      }, { status: 404 });
    }
    const { data, error } = await svc.from("companies").upsert(
      { name, domain, ats_type: found.ats, ats_slug: found.slug, enabled: true },
      { onConflict: "ats_type,ats_slug" }
    ).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const run = await runIngestion({ companyId: data.id, repair: false });
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, found, sales_roles: run.sales_roles });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing company id." }, { status: 400 });

  if (body.action === "toggle") {
    const { error } = await svc.from("companies").update({ enabled: !!body.enabled }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!body.enabled) await svc.from("jobs").update({ is_active: false }).eq("company_id", id);
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "repair") {
    const { data: c } = await svc.from("companies").select("name, domain").eq("id", id).single();
    if (!c) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    const found = await discoverBoard(c.name, c.domain);
    if (!found) return NextResponse.json({ error: `No public board found for ${c.name}.` }, { status: 404 });
    const { error } = await svc.from("companies").update({ ats_type: found.ats, ats_slug: found.slug, collect_error: null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const run = await runIngestion({ companyId: id, repair: false });
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, found, sales_roles: run.sales_roles });
  }

  if (body.action === "run") {
    const run = await runIngestion({ companyId: id });
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...run });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
