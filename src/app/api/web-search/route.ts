import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { buildCompanyQuery, buildJobQuery, JOB_HOSTS, searchWeb, WebSearchError, webSearchConfigured } from "@/lib/websearch";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/web-search { kind: "jobs" | "companies", ...filters, days? }
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!webSearchConfigured()) return NextResponse.json({ error: "Open-web search isn't set up yet. Add TAVILY_API_KEY in Vercel, then redeploy." }, { status: 503 });
  if (!(await rateLimitShared(`web:${user.id}`, 30, 3600_000))) {
    return NextResponse.json({ error: `Slow down a little. Try again in ${retryAfter(`web:${user.id}`)}s.` }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  const days = [7, 30].includes(Number(b.days)) ? Number(b.days) : 0;
  const query = b.kind === "companies"
    ? buildCompanyQuery({ industry: s(b.industry), location: s(b.location), size: s(b.size), stage: s(b.stage), hiring: b.hiring === true })
    : buildJobQuery({ role: s(b.role), company: s(b.company), location: s(b.location), level: s(b.level), tools: s(b.tools), workType: s(b.workType), visa: b.visa === true });
  try {
    // Stealth: never surface a result from an excluded company (for example the current employer).
    const results = (await searchWeb(query, { days, kind: b.kind === "companies" ? "companies" : "jobs", includeDomains: b.kind !== "companies" && b.wide !== true ? JOB_HOSTS : undefined })).filter((r) => !isExcludedCompany(r.title, r.url));
    return NextResponse.json({ ok: true, query, results });
  } catch (e) {
    if (e instanceof WebSearchError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("web-search failed:", e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
