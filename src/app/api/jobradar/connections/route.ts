import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner, missingTable } from "@/lib/jobradar-auth";
import { companyKey } from "@/lib/jobs/referral-paths";
import { isExcludedCompany } from "@/data/companies";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIGRATION = "Run supabase/migrations/0016_jobradar.sql in Supabase first (SQL Editor -> paste -> Run).";
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v: unknown) => { const t = Date.parse(s(v, 40)); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };

// POST /api/jobradar/connections { connections?: [{full_name, company, position, linkedin_url, connected_on}], past_employers?, college? }
// Replaces your stored LinkedIn connections (from LinkedIn's own export) and saves search-link settings.
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 20);
  if (auth instanceof NextResponse) return auth;
  const { svc, ownerId } = auth;
  const b = await req.json().catch(() => ({}));

  const settings: Record<string, unknown> = {};
  if (Array.isArray(b.past_employers)) settings.past_employers = b.past_employers.map((x: unknown) => s(x, 120)).filter(Boolean).slice(0, 10);
  if (typeof b.college === "string") settings.college = s(b.college, 160) || null;
  if (Object.keys(settings).length) {
    const { error } = await svc.from("profiles").update(settings).eq("user_id", ownerId);
    if (error) return NextResponse.json({ error: missingTable(error) ? MIGRATION : error.message }, { status: missingTable(error) ? 409 : 500 });
  }

  if (!Array.isArray(b.connections)) return NextResponse.json({ ok: true, saved: 0 });
  const rows = (b.connections as unknown[]).slice(0, 30_000).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const company = s(o.company, 200);
    return { user_id: ownerId, full_name: s(o.full_name, 160), company: company || null, company_key: companyKey(company) || null,
      position: s(o.position, 200) || null, linkedin_url: s(o.linkedin_url, 400) || null, connected_on: date(o.connected_on) };
  }).filter((r) => r.full_name && !isExcludedCompany(r.company));   // your current employer's people are never stored

  const del = await svc.from("connections").delete().eq("user_id", ownerId);
  if (del.error) return NextResponse.json({ error: missingTable(del.error) ? MIGRATION : del.error.message }, { status: missingTable(del.error) ? 409 : 500 });
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await svc.from("connections").insert(rows.slice(i, i + 1000));
    if (error) return NextResponse.json({ error: `Saved ${i} of ${rows.length}, then: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: rows.length });
}
