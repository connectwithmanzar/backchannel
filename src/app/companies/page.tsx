import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { isExcludedCompany } from "@/data/companies";
import { Card } from "@/components/ui";
import { roleCounts, suggestCompanies, tierRank, type CompanyRow, type CompanyStatus, type CompanyTier } from "@/lib/company-list";
import { effectiveTier, isTier } from "@/lib/company-rating";
import { formatCompanyName } from "@/lib/company-name";
import { sanitizeResearch, type Research } from "@/lib/company-research";
import CompanyJobsFinder from "../roles/CompanyJobsFinder";
import ImportCompanies from "../sources/ImportCompanies";
import DiscoverButton from "../sources/DiscoverButton";
import ImportStatus from "../sources/ImportStatus";
import CompaniesList from "./CompaniesList";
import SuggestedCompanies from "./SuggestedCompanies";

export const dynamic = "force-dynamic";

type Co = { id: string; name: string; domain: string | null; ats_type: string | null; ats_slug: string | null; enabled: boolean; collect_error: string | null; last_collected_at: string | null;
  country?: string | null; size?: string | null; sector?: string | null; linkedin_url?: string | null; company_type?: string | null; hiring_signal?: string | null; linkedin_openings?: number | null };
type Wl = { company_id: string; watching: boolean; status?: string | null; note?: string | null; tier?: string | null };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ find?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";

  const BASE = "id, name, domain, ats_type, ats_slug, enabled, collect_error, last_collected_at";
  const [rich, { data: jobs }, withStatus] = await Promise.all([
    // The enrichment columns arrive with migration 0014. Until it is run, read the plain list instead.
    db.from("companies").select(`${BASE}, country, size, sector, linkedin_url, company_type, hiring_signal, linkedin_openings`).order("name").limit(1500),
    db.from("jobs").select("company_id, location, created_at").eq("is_active", true).limit(8000),
    db.from("watchlist").select("company_id, watching, status, note, tier").eq("user_id", uid),
  ]);
  const companies = rich.error ? (await db.from("companies").select(BASE).order("name").limit(1500)).data : rich.data;
  // The status and note columns arrive with migration 0013, tiers with 0017. Until they are run, read what exists instead.
  let watch: Wl[];
  if (!withStatus.error) watch = (withStatus.data ?? []) as Wl[];
  else {
    const noTier = await db.from("watchlist").select("company_id, watching, status, note").eq("user_id", uid);
    watch = !noTier.error
      ? ((noTier.data ?? []) as Wl[])
      : (((await db.from("watchlist").select("company_id, watching").eq("user_id", uid)).data ?? []) as Wl[]);
  }
  const byCompany = new Map(watch.map((w) => [w.company_id, w]));
  // What you saved about each company arrives with migration 0018. Until it is run, there is none.
  const researchRes = await db.from("company_research").select("*").eq("user_id", uid);
  const researchBy = new Map<string, Research>(researchRes.error ? [] : (researchRes.data ?? []).map((r) => [r.company_id as string, { ...sanitizeResearch(r), researched_at: (r.researched_at as string | null) ?? null }]));
  const counts = roleCounts(jobs ?? []);

  const rows: CompanyRow[] = ((companies ?? []) as Co[])
    .filter((c) => !isExcludedCompany(c.name, c.domain, c.ats_slug))
    .map((c) => {
      const w = byCompany.get(c.id);
      const k = counts.get(c.id) ?? { roles: 0, inIndia: 0, newThisWeek: 0 };
      return {
        id: c.id, name: formatCompanyName(c.name), domain: c.domain, atsType: c.ats_type === "other" && c.ats_slug?.includes(":") ? c.ats_slug.split(":")[0] : c.ats_type, hasBoard: !!c.ats_slug, enabled: c.enabled,
        error: c.collect_error, lastCheckedAt: c.last_collected_at, ...k,
        country: c.country ?? null, size: c.size ?? null, sector: c.sector ?? null, linkedinUrl: c.linkedin_url ?? null,
        companyType: c.company_type ?? null, hiring: (c.hiring_signal ?? null) as CompanyRow["hiring"], linkedinOpenings: c.linkedin_openings ?? null,
        status: (w?.status ?? null) as CompanyStatus, note: w?.note ?? "", watching: w?.watching ?? false,
        tier: (isTier(w?.tier) ? w?.tier : null) as CompanyTier,
        research: researchBy.get(c.id) ?? null,
      };
    })
    // Companies with open roles first, then by how many.
    .sort((a, b) => tierRank(effectiveTier(b.tier, b.research).tier) - tierRank(effectiveTier(a.tier, a.research).tier) || b.roles - a.roles || a.name.localeCompare(b.name));
  const suggestions = suggestCompanies(rows);
  const owner = isOwner(user?.email);
  // How far the board search has got. The board_checked_at column arrives with migration 0015.
  let status = { total: rows.length, withBoard: rows.filter((r) => r.hasBoard).length, unchecked: 0, migrated: false };
  if (owner) {
    const q = await db.from("companies").select("id", { count: "exact", head: true }).eq("enabled", true).is("ats_slug", null).is("board_checked_at", null);
    status = q.error ? { ...status, unchecked: rows.filter((r) => !r.hasBoard && !r.lastCheckedAt).length } : { ...status, unchecked: q.count ?? 0, migrated: true };
  }

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Companies</h1>
        <p className="mt-1 max-w-[62ch] text-muted">Your target list. Mark your top companies Tier A and your good ones Tier B: their roles show first on Jobs. Every company you add is checked for jobs every morning.</p>
      </header>

      <div className="mb-6"><CompanyJobsFinder initialName={(sp.find ?? "").slice(0, 100)} /></div>
      <SuggestedCompanies suggestions={suggestions} />

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_620px]"><CompaniesList initial={rows} /></div>
        <aside className="flex min-w-[280px] flex-[1_1_320px] flex-col gap-4" aria-label="Add companies">
          {owner ? (
            <>
              <ImportStatus {...status} />
              <ImportCompanies />
              <DiscoverButton />
            </>
          ) : (
            <Card><p className="text-sm text-muted">Only the account owner can add companies in bulk.</p></Card>
          )}
          <Card>
            <h2 className="mb-2 text-[17px] font-semibold">Coverage</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-bg p-3"><div className="font-display text-2xl font-bold num">{rows.length}</div><div className="text-sm text-muted">Companies</div></div>
              <div className="rounded-xl bg-bg p-3"><div className="font-display text-2xl font-bold num">{rows.reduce((n, c) => n + c.roles, 0)}</div><div className="text-sm text-muted">Open sales roles</div></div>
            </div>
          </Card>
        </aside>
      </div>
    </section>
  );
}
