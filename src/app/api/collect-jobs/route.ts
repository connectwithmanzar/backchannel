import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_SEEDS, type CompanySeed } from "@/data/companies";
import { fetchGreenhouse, fetchLever, fetchAshby, fetchSmartRecruiters, type RawJob } from "@/lib/collectors/ats";
import { isSalesRole, normalise } from "@/lib/jobs/process";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min timeout for full run

// Service-role client can write to shared tables (companies, jobs).
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Upsert a company seed → returns the company UUID.
async function upsertCompany(
  supabase: ReturnType<typeof getServiceClient>,
  seed: CompanySeed
): Promise<string | null> {
  const { data, error } = await supabase
    .from("companies")
    .upsert(
      {
        name: seed.name,
        domain: seed.domain,
        country: seed.country,
        ats_type: seed.ats_type,
        ats_slug: seed.ats_slug,
        careers_url: seed.careers_url,
      },
      { onConflict: "ats_type,ats_slug" }
    )
    .select("id")
    .single();

  if (error) {
    console.error(`[collect-jobs] upsert company ${seed.name}:`, error.message);
    return null;
  }
  return data.id;
}

// Mark jobs that disappeared from the ATS feed as inactive.
async function markInactiveForCompany(
  supabase: ReturnType<typeof getServiceClient>,
  companyId: string,
  activeHashes: string[]
): Promise<void> {
  if (!activeHashes.length) return;
  await supabase
    .from("jobs")
    .update({ is_active: false })
    .eq("company_id", companyId)
    .eq("is_active", true)
    .not("dedupe_hash", "in", `(${activeHashes.map((h) => `'${h}'`).join(",")})`);
}

export async function POST(req: NextRequest) {
  // Allow a single-company test via ?slug=hubspot
  const { searchParams } = new URL(req.url);
  const slugFilter = searchParams.get("slug");

  const seeds = COMPANY_SEEDS.filter(
    (s) => s.enabled && (!slugFilter || s.ats_slug === slugFilter)
  );

  if (!seeds.length) {
    return NextResponse.json({ error: "No matching companies" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const results: Array<{
    company: string;
    fetched: number;
    sales: number;
    upserted: number;
  }> = [];
  let totalUpserted = 0;

  for (const seed of seeds) {
    const companyId = await upsertCompany(supabase, seed);
    if (!companyId) continue;

    // Fetch and collect
    let rawJobs: RawJob[];
    try {
      if (seed.ats_type === "greenhouse") rawJobs = await fetchGreenhouse(seed.ats_slug);
      else if (seed.ats_type === "lever") rawJobs = await fetchLever(seed.ats_slug);
      else if (seed.ats_type === "ashby") rawJobs = await fetchAshby(seed.ats_slug);
      else rawJobs = await fetchSmartRecruiters(seed.ats_slug);
    } catch {
      rawJobs = [];
    }

    const salesJobs = rawJobs.filter((j) => isSalesRole(j.title));
    const activeHashes: string[] = [];
    let upserted = 0;

    for (const raw of salesJobs) {
      const norm = normalise(raw, seed.name);
      activeHashes.push(norm.dedupe_hash);

      const { error } = await supabase.from("jobs").upsert(
        {
          company_id: companyId,
          ...norm,
          last_checked_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "dedupe_hash" }
      );

      if (!error) upserted++;
    }

    // Mark any previously active jobs that weren't in this fetch as inactive
    if (activeHashes.length) await markInactiveForCompany(supabase, companyId, activeHashes);

    results.push({ company: seed.name, fetched: rawJobs.length, sales: salesJobs.length, upserted });
    totalUpserted += upserted;
  }

  return NextResponse.json({
    ok: true,
    companies_checked: results.length,
    total_upserted: totalUpserted,
    results,
  });
}

// GET returns current job counts (useful for the UI)
export async function GET() {
  const supabase = getServiceClient();
  const { count } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { data: recent } = await supabase
    .from("jobs")
    .select("id, title, location, board, last_checked_at, companies(name)")
    .eq("is_active", true)
    .order("last_checked_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ total: count ?? 0, recent: recent ?? [] });
}
