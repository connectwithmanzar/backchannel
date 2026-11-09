import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { ApolloError, apolloConfigured, cleanDomain, revealPerson, searchPeople } from "@/lib/contacts/apollo";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_DAYS = 30;
const SEARCH_CAP = Number(process.env.APOLLO_SEARCH_CAP ?? 100); // per user per month
const REVEAL_CAP = Number(process.env.APOLLO_REVEAL_CAP ?? 10);  // per user per month, may use Apollo credits

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

// POST /api/contacts/find { action: "search", company, domain } | { action: "reveal", person_id }
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!apolloConfigured()) return NextResponse.json({ error: "People search isn't set up yet. Add APOLLO_API_KEY in Vercel, then redeploy." }, { status: 503 });
  if (!rateLimit(`find:${user.id}`, 30, 3600_000)) {
    return NextResponse.json({ error: `Slow down a little. Try again in ${retryAfter(`find:${user.id}`)}s.` }, { status: 429 });
  }

  const b = await req.json().catch(() => ({}));
  const svc = serviceClient();

  const usedThisMonth = async (kind: "search" | "reveal") => {
    const { count } = await svc.from("contact_lookups").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("kind", kind).gte("created_at", monthStart());
    return count ?? 0;
  };

  try {
    if (b.action === "search") {
      const company = String(b.company ?? "").trim().slice(0, 200);
      const domain = cleanDomain(String(b.domain ?? ""));
      if (!company || !domain) return NextResponse.json({ error: "Enter the company name and its website, like acme.com." }, { status: 400 });
      // Stealth: never surface people at a blocked or excluded company.
      if (isExcludedCompany(company, domain) || (await isBlocked(db, user.id, `x@${domain}`, company))) {
        return NextResponse.json({ error: `${company} is on your stealth or excluded list, so I won't look for people there.` }, { status: 400 });
      }
      const { data: cached } = await svc.from("contact_lookups").select("result, created_at")
        .eq("user_id", user.id).eq("kind", "search").eq("company_key", domain).maybeSingle();
      if (cached && Date.now() - Date.parse(cached.created_at) < CACHE_DAYS * 864e5) {
        return NextResponse.json({ ok: true, people: cached.result, cached: true });
      }
      if ((await usedThisMonth("search")) >= SEARCH_CAP) {
        return NextResponse.json({ error: `You've used your ${SEARCH_CAP} company searches for this month.` }, { status: 429 });
      }
      const people = await searchPeople(domain, company);
      await svc.from("contact_lookups").upsert(
        { user_id: user.id, kind: "search", company_key: domain, result: people, created_at: new Date().toISOString() },
        { onConflict: "user_id,kind,company_key" }
      );
      return NextResponse.json({ ok: true, people, cached: false });
    }

    if (b.action === "reveal") {
      const id = String(b.person_id ?? "");
      if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "Missing person." }, { status: 400 });
      const { data: cached } = await svc.from("contact_lookups").select("result")
        .eq("user_id", user.id).eq("kind", "reveal").eq("company_key", id).maybeSingle();
      if (cached) return NextResponse.json({ ok: true, person: cached.result, cached: true });
      if ((await usedThisMonth("reveal")) >= REVEAL_CAP) {
        return NextResponse.json({ error: `You've used your ${REVEAL_CAP} name reveals for this month (they can use Apollo credits).` }, { status: 429 });
      }
      const person = await revealPerson(id);
      if (!person) return NextResponse.json({ error: "Apollo couldn't match that person." }, { status: 404 });
      await svc.from("contact_lookups").upsert(
        { user_id: user.id, kind: "reveal", company_key: id, result: person, created_at: new Date().toISOString() },
        { onConflict: "user_id,kind,company_key" }
      );
      return NextResponse.json({ ok: true, person, cached: false });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof ApolloError) return NextResponse.json({ error: e.message }, { status: e.status === 429 ? 429 : 502 });
    console.error("contacts/find failed:", e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
