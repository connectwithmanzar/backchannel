import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isOwner } from "@/lib/owner";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { cleanDomain } from "@/lib/contacts/apollo";
import { cleanExtra } from "@/lib/clay-import";

export const runtime = "nodejs";
export const maxDuration = 60;
const CHUNK = 200;

// POST /api/sources/save-list { companies: [{ name, domain, extra }] } saves up to 200 companies at once, with no board search,
// so a whole list is stored in seconds. Finding each company's job board happens afterwards and can be resumed.
export async function POST(req: NextRequest) {
  const uc = await createClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Only the owner can change sources." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const input: { name?: unknown; domain?: unknown; extra?: unknown }[] = Array.isArray(body.companies) ? body.companies.slice(0, CHUNK) : [];
  if (!input.length) return NextResponse.json({ error: "No companies to save." }, { status: 400 });

  const svc = serviceClient();
  const { data: existing } = await svc.from("companies").select("id, name, domain");
  const byName = new Map((existing ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));
  const byDomain = new Map((existing ?? []).filter((c: { domain: string | null }) => c.domain).map((c: { id: string; domain: string | null }) => [c.domain as string, c.id]));

  let added = 0, already = 0, excluded = 0;
  const rows: Record<string, unknown>[] = [];
  const updates: { id: string; extra: ReturnType<typeof cleanExtra> }[] = [];
  for (const c of input) {
    const name = String(c.name ?? "").trim().slice(0, 120);
    const domain = typeof c.domain === "string" ? cleanDomain(c.domain) : null;
    if (!name) continue;
    const extra = cleanExtra(c.extra);
    if (isExcludedCompany(name, domain) || (await isBlocked(uc, user.id, "", name))) { excluded++; continue; }
    const id = (domain && byDomain.get(domain)) || byName.get(name.toLowerCase());
    if (id) { already++; updates.push({ id, extra }); continue; }
    byName.set(name.toLowerCase(), "pending"); if (domain) byDomain.set(domain, "pending");
    rows.push({ name, domain, enabled: true, country: extra.country, hq: extra.hq, size: extra.size, sector: extra.sector });
  }
  if (rows.length) {
    const { data, error } = await svc.from("companies").insert(rows).select("id, name");
    if (error) { console.error("save-list: insert failed:", error.message); return NextResponse.json({ error: "Couldn't save that batch." }, { status: 500 }); }
    added = data?.length ?? 0;
  }
  // Newer columns arrive with migration 0014; a missing column is skipped quietly.
  const idsByName = new Map(((await svc.from("companies").select("id, name, domain").in("name", input.map((c) => String(c.name ?? "").trim().slice(0, 120)))).data ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));
  for (const c of input) {
    const id = idsByName.get(String(c.name ?? "").trim().slice(0, 120).toLowerCase());
    if (!id) continue;
    const x = cleanExtra(c.extra);
    const { error } = await svc.from("companies").update({ linkedin_url: x.linkedin_url, company_type: x.company_type, hiring_signal: x.hiring_signal, linkedin_openings: x.linkedin_openings }).eq("id", id);
    if (error && !/column/i.test(error.message)) console.error("save-list: enrichment failed:", error.message);
  }
  return NextResponse.json({ ok: true, added, already, excluded });
}
