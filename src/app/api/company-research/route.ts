import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiJson, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { searchWeb, webSearchConfigured, type WebResult } from "@/lib/websearch";
import { EMPTY_RESEARCH, researchQueries, sanitizeResearch, type Research } from "@/lib/company-research";
import { isMissingSchema, MIGRATION_0018 } from "@/lib/migration";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You research one company for a sales job seeker in India. ${DATA_NOTICE} Absolute rules:
- Use ONLY facts stated in the search results. If a fact is not stated, use null. Never guess.
- Ratings: set glassdoor_rating, ambitionbox_rating, wlb_rating or growth_rating only when a result states that exact number on a 5-point scale. Otherwise null.
- work_mode is one of remote, hybrid, office, mixed. website is the company's own domain.
- pay_note: pay published for sales roles, with currency and period, or null.
- perks: up to 6 short perks actually named (for example family health insurance, learning budget, remote setup allowance, flexible leave).
- summary: two plain sentences, only from the results: one reason it may be a good place to work and one concern or unknown. Null if the results say too little.
- sources: for every field you filled, the URL of the result it came from.
Reply with one JSON object with keys: website, hq, work_mode, hiring_locations, pay_note, perks, summary, glassdoor_rating, ambitionbox_rating, wlb_rating, growth_rating, sources.`;

type Company = { id: string; name: string; domain: string | null };

async function who() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return { db, user };
}

const uuid = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

// GET /api/company-research?company_id=...: what you saved for this company.
export async function GET(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = uuid(new URL(req.url).searchParams.get("company_id"));
  if (!id) return NextResponse.json({ error: "Missing company." }, { status: 400 });
  const { data, error } = await db.from("company_research").select("*").eq("user_id", user.id).eq("company_id", id).maybeSingle();
  if (error) return NextResponse.json({ research: EMPTY_RESEARCH, needsMigration: isMissingSchema(error), error: isMissingSchema(error) ? MIGRATION_0018 : "Couldn't load it." });
  return NextResponse.json({ research: data ? { ...sanitizeResearch(data), researched_at: data.researched_at ?? null } : EMPTY_RESEARCH });
}

// POST /api/company-research { company_id, action: "research" }  -> a draft from open web search (not saved)
// POST /api/company-research { company_id, research: {...} }     -> save your reviewed version
export async function POST(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = uuid(b.company_id);
  if (!id) return NextResponse.json({ error: "Missing company." }, { status: 400 });

  if (b.action === "research") return draft(db, user.id, id);

  const research = sanitizeResearch(b.research);
  const { error } = await db.from("company_research").upsert(
    { user_id: user.id, company_id: id, ...research, updated_at: new Date().toISOString() },
    { onConflict: "user_id,company_id" },
  );
  if (error) {
    console.error("company-research save failed:", error.message);
    return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_0018 : "Couldn't save that." }, { status: isMissingSchema(error) ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, research });
}

async function draft(db: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  const { data: co } = await db.from("companies").select("id, name, domain").eq("id", id).maybeSingle();
  const company = co as Company | null;
  if (!company) return NextResponse.json({ error: "That company no longer exists." }, { status: 404 });
  // Stealth: never research or surface the current employer.
  if (isExcludedCompany(company.name, company.domain)) return NextResponse.json({ error: "This company is on your never-contact list." }, { status: 400 });
  if (!webSearchConfigured()) return NextResponse.json({ error: "Open-web search isn't set up yet. Add TAVILY_API_KEY in Vercel, then redeploy." }, { status: 503 });
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  if (!(await rateLimitShared(`cresearch:${userId}`, 20, 3600_000))) {
    return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`cresearch:${userId}`)}s.` }, { status: 429 });
  }

  const settled = await Promise.allSettled(researchQueries(company.name, company.domain).map((q) => searchWeb(q, { max: 5, kind: "companies" })));
  const seen = new Set<string>();
  const results: WebResult[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const r of s.value) if (!seen.has(r.url) && !isExcludedCompany(r.title, r.url)) { seen.add(r.url); results.push(r); }
  }
  if (!results.length) return NextResponse.json({ error: "The web search found nothing for this company. Try again, or fill the facts in yourself." }, { status: 404 });

  const context = results.slice(0, 14).map((r, i) => untrusted(`result_${i + 1}`, `URL: ${r.url}\nTITLE: ${r.title}\nTEXT: ${r.snippet}`)).join("\n");
  try {
    const raw = await aiJson<Record<string, unknown>>(SYSTEM, `COMPANY: ${company.name}${company.domain ? ` (${company.domain})` : ""}\n\n${context}`, { maxTokens: 1200 });
    const parsed = sanitizeResearch(raw);
    // A source must be a page the search actually returned, so a made-up link is dropped.
    const sources = Object.fromEntries(Object.entries(parsed.sources).filter(([, url]) => seen.has(url)));
    const out: Research = { ...parsed, website: parsed.website ?? company.domain, sources, researched_at: new Date().toISOString() };
    return NextResponse.json({ ok: true, research: out, checked: results.length });
  } catch (e) {
    console.error("company research failed:", e);
    return NextResponse.json({ error: "Couldn't read the search results. Try again." }, { status: 502 });
  }
}
