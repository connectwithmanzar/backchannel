import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { promises as dns } from "node:dns";
import { isExcludedCompany } from "@/data/companies";
import { cleanDomain } from "@/lib/contacts/apollo";
import { createAIClient, hasAIKey, AI_MODEL, NO_AI_MESSAGE, parseJsonLoose } from "@/lib/ai";
import { discoverBoard } from "@/lib/collectors/ats";

export const runtime = "nodejs";
export const maxDuration = 120;

type CuratedCompany = {
  name: string;
  domain: string;
  country: string;
  hq: string;
  sector: string;
  why_great: string;
  criteria_tags: string[];
  awards: { name: string; year: number; source_url: string }[];
  visa_note: string | null;
};

function buildPrompt(prefs: {
  great_company_criteria: string[];
  valued_awards: string[];
  countries: string[];
  dealbreakers: string[];
  markets: string[];
  tools: string[];
}): string {
  const criteria = prefs.great_company_criteria.length
    ? prefs.great_company_criteria.join(", ")
    : "great culture, strong growth, high OTE potential";
  const awards = prefs.valued_awards.length
    ? prefs.valued_awards.join(", ")
    : "Best Places to Work, Great Place to Work";
  const countries = prefs.countries.length
    ? prefs.countries.join(", ")
    : "India, US, UK";
  const dealbreakers = prefs.dealbreakers.length
    ? prefs.dealbreakers.join(", ")
    : "none specified";
  const tools = prefs.tools.length ? prefs.tools.join(", ") : "Salesforce, Outreach";

  return `You are a job-search assistant helping a B2B sales professional (SDR/BDR, AE, GTM Engineer) find great companies to target.

User preferences:
- Criteria for great companies: ${criteria}
- Valued awards/certifications: ${awards}
- Target countries: ${countries}
- Dealbreakers: ${dealbreakers}
- Known tools/tech: ${tools}

Suggest up to 12 real companies that match these preferences. Only include companies you are confident exist and that sell to or hire B2B sales people. Return fewer than 12 if you are unsure. Do not make claims about layoffs, funding amounts, hiring status or awards: you cannot check them. Write "why_great" as one short sentence using only widely known general facts about the company, and say "unknown" for anything you are not sure of. Use an empty awards array and null for visa_note.

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "companies": [
    {
      "name": "Company Name",
      "domain": "example.com",
      "country": "India",
      "hq": "Bengaluru, India",
      "sector": "SaaS / HR Tech",
      "why_great": "One paragraph on why this company suits the user's specific criteria. Factual only.",
      "criteria_tags": ["Great Culture", "High OTE"],
      "awards": [],
      "visa_note": null
    }
  ]
}`;
}

export async function POST() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 3 curation runs per hour per user — guards against runaway AI spend
  if (!(await rateLimitShared(`curate:${user.id}`, 3, 60 * 60 * 1000))) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in " + retryAfter(`curate:${user.id}`) + "s." },
      { status: 429 }
    );
  }

  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: prefs }, { data: profile }] = await Promise.all([
    svc.from("preferences").select("*").eq("user_id", user.id).maybeSingle(),
    svc.from("profiles").select("markets, tools").eq("user_id", user.id).maybeSingle(),
  ]);

  const prefsData = {
    great_company_criteria: prefs?.great_company_criteria ?? [],
    valued_awards: prefs?.valued_awards ?? [],
    countries: prefs?.countries ?? [],
    dealbreakers: prefs?.dealbreakers ?? [],
    markets: profile?.markets ?? [],
    tools: profile?.tools ?? [],
  };

  if (!hasAIKey()) {
    return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 400 });
  }

  const client = createAIClient();
  let companies: CuratedCompany[] = [];

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: buildPrompt(prefsData) }],
    });
    const text = response.choices[0].message.content ?? "";
    const parsed = parseJsonLoose<{ companies?: CuratedCompany[] }>(text);
    companies = Array.isArray(parsed.companies) ? parsed.companies : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("curate-companies failed:", message);
    return NextResponse.json({ error: `AI curation failed: ${message}`.slice(0, 200) }, { status: 500 });
  }

  // The model only suggests names. A company is kept only if its website really resolves.
  const verified: CuratedCompany[] = [];
  for (const c of companies) {
    const domain = cleanDomain(String(c.domain ?? ""));
    if (!c.name || !domain || isExcludedCompany(c.name, domain)) continue;
    try { await dns.lookup(domain); } catch { continue; }
    verified.push({ ...c, domain, awards: [], visa_note: null, why_great: String(c.why_great ?? "").slice(0, 400) });
  }

  // Upsert each company into companies table then company_insights
  const results: { name: string; id: string }[] = [];
  for (const c of verified) {
    const { data: existing } = await svc
      .from("companies")
      .select("id")
      .ilike("name", c.name)
      .limit(1)
      .maybeSingle();

    let co: { id: string } | null = existing;
    let coErr: unknown = null;
    if (!co) {
      const inserted = await svc
        .from("companies")
        .insert({
          name: c.name,
          domain: c.domain || null,
          country: c.country || null,
          hq: c.hq || null,
          sector: c.sector || null,
        })
        .select("id")
        .maybeSingle();
      co = inserted.data;
      coErr = inserted.error;
    }

    if (coErr || !co) {
      console.error("curate-companies: company save failed", c.name, coErr);
      continue;
    }

    await svc.from("company_insights").upsert(
      {
        user_id: user.id,
        company_id: co.id,
        why_great: c.why_great,
        criteria_tags: c.criteria_tags ?? [],
        awards: c.awards ?? [],
        visa_note: c.visa_note ?? null,
        added_by: "ai",
        hidden: false,
      },
      { onConflict: "user_id,company_id" }
    );

    // Auto-add to watchlist
    await svc.from("watchlist").upsert(
      { user_id: user.id, company_id: co.id, watching: true },
      { onConflict: "user_id,company_id", ignoreDuplicates: true }
    );

    results.push({ name: c.name, id: co.id });
  }

  // Find each new company's public job board so their open sales roles get collected too.
  const deadline = Date.now() + 30_000;
  const { data: noBoard } = await svc.from("companies").select("id, name, domain").in("id", results.map((r) => r.id)).is("ats_slug", null);
  let boards = 0;
  await Promise.all((noBoard ?? []).map(async (c: { id: string; name: string; domain: string | null }) => {
    if (Date.now() > deadline) return;
    const found = await discoverBoard(c.name, c.domain).catch(() => null);
    if (!found) return;
    const { error } = await svc.from("companies").update({ ats_type: found.ats, ats_slug: found.slug, enabled: true }).eq("id", c.id);
    if (!error) boards++;
  }));

  return NextResponse.json({ ok: true, added: results.length, boards_found: boards, companies: results });
}
