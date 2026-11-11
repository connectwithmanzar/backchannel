import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner, missingTable } from "@/lib/jobradar-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const WEEK = 7 * 864e5;
const weekStart = (t: number) => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

// GET /api/jobradar/summary: what JobRadar needs from Backchannel in one call. Owner only (JOBRADAR_SECRET).
// great companies, profile basics for search links, an 8-week scorecard, outcomes per job (for the learning search),
// and people who helped (for the network keeper).
export async function GET(req: NextRequest) {
  const auth = await jobradarOwner(req);
  if (auth instanceof NextResponse) return auth;
  const { svc, ownerId } = auth;
  const since = new Date(Date.now() - 8 * WEEK).toISOString();

  const [insights, profile, events, refs, apps] = await Promise.all([
    svc.from("company_insights").select("why_great, hidden, companies(name, domain)").eq("user_id", ownerId).limit(200),
    svc.from("profiles").select("*").eq("user_id", ownerId).maybeSingle(),
    svc.from("funnel_events").select("type, occurred_at").eq("user_id", ownerId).gte("occurred_at", since).limit(5000),
    svc.from("referrals").select("company_name, referrer_name, referrer_relation, stage, created_at, updated_at").eq("user_id", ownerId).limit(1000),
    svc.from("applications").select("*, jobs(title, company_name, location, market, source, url, companies(name))").eq("user_id", ownerId).limit(1000),
  ]);

  const great = (insights.data ?? [])
    .filter((r) => !r.hidden)
    .map((r) => { const c = r.companies as unknown as { name: string; domain: string | null } | null; return c ? { name: c.name, domain: c.domain, why_great: r.why_great ?? "" } : null; })
    .filter(Boolean);

  // Scorecard: 8 weeks, Monday-start, newest first.
  const weeks: Record<string, Record<string, number>> = {};
  for (let i = 0; i < 8; i++) weeks[weekStart(Date.now() - i * WEEK)] = { applied: 0, outreach_sent: 0, reply: 0, referral: 0, interview: 0, offer: 0, referrals_asked: 0 };
  for (const e of events.data ?? []) { const w = weeks[weekStart(Date.parse(e.occurred_at))]; if (w && e.type in w) w[e.type]++; }
  for (const r of refs.data ?? []) {
    if (r.stage === "to_ask") continue;
    const w = weeks[weekStart(Date.parse(r.updated_at ?? r.created_at))];
    if (w) w.referrals_asked++;
  }

  const outcomes = (apps.data ?? []).map((a) => {
    const j = a.jobs as unknown as { title: string; company_name: string | null; location: string | null; market: string | null; source: string | null; url: string | null; companies: { name: string } | null } | null;
    return {
      title: j?.title ?? "", company: j?.companies?.name ?? j?.company_name ?? "", location: j?.location ?? "", market: j?.market ?? "",
      source: j?.source ?? "careers", url: j?.url ?? "", status: a.status ?? "", stage: (a as { stage?: string }).stage ?? "", created_at: a.created_at,
    };
  });

  const p = (profile.data ?? {}) as Record<string, unknown>;
  const helpers = (refs.data ?? []).filter((r) => ["agreed", "referred", "interview"].includes(r.stage ?? ""))
    .map((r) => ({ name: r.referrer_name, company: r.company_name, relation: r.referrer_relation, stage: r.stage, last_touch: r.updated_at ?? r.created_at }));

  return NextResponse.json({
    ok: true,
    great_companies: great,
    profile: {
      name: p.name ?? null, current_role: p.current_role ?? null, tools: p.tools ?? [], target_titles: p.target_titles ?? [], markets: p.markets ?? [],
      past_employers: (p.past_employers as string[] | undefined) ?? [], college: (p.college as string | undefined) ?? null, has_cv: !!p.cv_text,
      needs_migration_0016: !("past_employers" in p) && !!profile.data,
    },
    scorecard: Object.entries(weeks).map(([week, c]) => ({ week, ...c })),
    outcomes,
    helpers,
    warnings: [insights.error, events.error, refs.error, apps.error].filter((e) => e && !missingTable(e)).map((e) => e!.message),
  });
}
