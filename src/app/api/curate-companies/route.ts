import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { createAIClient, hasAIKey, AI_MODEL } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

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

Suggest exactly 12 real companies that match these preferences. Prioritise companies with:
- Active sales teams hiring in those countries
- Strong employer brand or awards
- Clear product-led or sales-led motion
- No recent layoffs (within 6 months)

CRITICAL: Only include verifiable, sourced facts. If you cannot cite a specific award with a real source URL, leave the awards array empty. Never invent URLs.

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
  if (!rateLimit(`curate:${user.id}`, 3, 60 * 60 * 1000)) {
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
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 400 });
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
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object in model response");
    const parsed = JSON.parse(text.slice(start, end + 1));
    companies = Array.isArray(parsed.companies) ? parsed.companies : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("curate-companies failed:", message);
    return NextResponse.json({ error: `AI curation failed: ${message}`.slice(0, 200) }, { status: 500 });
  }

  // Upsert each company into companies table then company_insights
  const results: { name: string; id: string }[] = [];
  for (const c of companies) {
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

  return NextResponse.json({ ok: true, added: results.length, companies: results });
}
