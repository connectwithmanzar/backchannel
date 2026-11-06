import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

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

  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey || apiKey.startsWith("sk-ant-api03-PLACEHOLDER") || apiKey === "sk-ant-...") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  let companies: CuratedCompany[] = [];

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: buildPrompt(prefsData) }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text);
    companies = Array.isArray(parsed.companies) ? parsed.companies : [];
  } catch {
    return NextResponse.json({ error: "AI curation failed" }, { status: 500 });
  }

  // Upsert each company into companies table then company_insights
  const results: { name: string; id: string }[] = [];
  for (const c of companies) {
    const { data: co, error: coErr } = await svc
      .from("companies")
      .upsert(
        {
          name: c.name,
          domain: c.domain || null,
          country: c.country || null,
          hq: c.hq || null,
          sector: c.sector || null,
        },
        { onConflict: "name", ignoreDuplicates: false }
      )
      .select("id")
      .maybeSingle();

    if (coErr || !co) continue;

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
