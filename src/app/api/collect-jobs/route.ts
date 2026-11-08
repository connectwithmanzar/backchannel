import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as userClient } from "@/lib/supabase/server";
import { COMPANY_SEEDS, isExcludedCompany, type CompanySeed } from "@/data/companies";
import { isOwner, isCronAuthorized } from "@/lib/owner";
import { fetchGreenhouse, fetchLever, fetchAshby, fetchSmartRecruiters, type RawJob } from "@/lib/collectors/ats";
import { isSalesRole, normalise } from "@/lib/jobs/process";

export const runtime = "nodejs";
export const maxDuration = 300;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
// Uses parameterised PostgREST filter — no raw SQL string interpolation.
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
    .not("dedupe_hash", "in", `(${activeHashes.join(",")})`);
}

type IngestionResult = {
  company: string;
  fetched: number;
  sales: number;
  upserted: number;
  error?: string;
};

async function runIngestion(slugFilter?: string | null): Promise<{
  companies_checked: number;
  total_upserted: number;
  results: IngestionResult[];
}> {
  const seeds = COMPANY_SEEDS.filter(
    (s) =>
      s.enabled &&
      !isExcludedCompany(s.name, s.domain, s.ats_slug) &&
      (!slugFilter || s.ats_slug === slugFilter)
  );

  const supabase = getServiceClient();
  const results: IngestionResult[] = [];
  let totalUpserted = 0;

  for (const seed of seeds) {
    const companyId = await upsertCompany(supabase, seed);
    if (!companyId) {
      results.push({ company: seed.name, fetched: 0, sales: 0, upserted: 0, error: "upsert failed" });
      continue;
    }

    let rawJobs: RawJob[];
    try {
      if (seed.ats_type === "greenhouse") rawJobs = await fetchGreenhouse(seed.ats_slug);
      else if (seed.ats_type === "lever") rawJobs = await fetchLever(seed.ats_slug);
      else if (seed.ats_type === "ashby") rawJobs = await fetchAshby(seed.ats_slug);
      else rawJobs = await fetchSmartRecruiters(seed.ats_slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch error";
      console.error(`[collect-jobs] fetch ${seed.name}:`, msg);
      results.push({ company: seed.name, fetched: 0, sales: 0, upserted: 0, error: msg });
      continue;
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

    if (activeHashes.length) await markInactiveForCompany(supabase, companyId, activeHashes);

    results.push({ company: seed.name, fetched: rawJobs.length, sales: salesJobs.length, upserted });
    totalUpserted += upserted;
  }

  return { companies_checked: results.length, total_upserted: totalUpserted, results };
}

// POST /api/collect-jobs — admin-only manual trigger
export async function POST(req: NextRequest) {
  const uc = await userClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOwner(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const slugFilter = searchParams.get("slug");

  if (
    !COMPANY_SEEDS.some(
      (s) =>
        s.enabled &&
        !isExcludedCompany(s.name, s.domain, s.ats_slug) &&
        (!slugFilter || s.ats_slug === slugFilter)
    )
  ) {
    return NextResponse.json({ error: "No matching companies" }, { status: 400 });
  }

  const result = await runIngestion(slugFilter);
  return NextResponse.json({ ok: true, ...result });
}

// GET /api/collect-jobs — Vercel cron endpoint (Bearer CRON_SECRET). Fails closed if unset.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runIngestion();
  return NextResponse.json({ ok: true, ...result });
}
