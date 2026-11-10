import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { isExcludedCompany } from "@/data/companies";
import { Card } from "@/components/ui";
import { roleCounts, type CompanyRow, type CompanyStatus } from "@/lib/company-list";
import CompanyJobsFinder from "../roles/CompanyJobsFinder";
import ImportCompanies from "../sources/ImportCompanies";
import DiscoverButton from "../sources/DiscoverButton";
import CompaniesList from "./CompaniesList";

export const dynamic = "force-dynamic";

type Co = { id: string; name: string; domain: string | null; ats_type: string | null; ats_slug: string | null; enabled: boolean; collect_error: string | null; last_collected_at: string | null;
  country?: string | null; size?: string | null; sector?: string | null; linkedin_url?: string | null; company_type?: string | null; hiring_signal?: string | null; linkedin_openings?: number | null };
type Wl = { company_id: string; watching: boolean; status?: string | null; note?: string | null };

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
    db.from("watchlist").select("company_id, watching, status, note").eq("user_id", uid),
  ]);
  const companies = rich.error ? (await db.from("companies").select(BASE).order("name").limit(1500)).data : rich.data;
  // The status and note columns arrive with migration 0013. Until it is run, read the plain list instead.
  const watch: Wl[] = withStatus.error
    ? (((await db.from("watchlist").select("company_id, watching").eq("user_id", uid)).data ?? []) as Wl[])
    : ((withStatus.data ?? []) as Wl[]);
  const byCompany = new Map(watch.map((w) => [w.company_id, w]));
  const counts = roleCounts(jobs ?? []);

  const rows: CompanyRow[] = ((companies ?? []) as Co[])
    .filter((c) => !isExcludedCompany(c.name, c.domain, c.ats_slug))
    .map((c) => {
      const w = byCompany.get(c.id);
      const k = counts.get(c.id) ?? { roles: 0, inIndia: 0, newThisWeek: 0 };
      return {
        id: c.id, name: c.name, domain: c.domain, atsType: c.ats_type, hasBoard: !!c.ats_slug, enabled: c.enabled,
        error: c.collect_error, lastCheckedAt: c.last_collected_at, ...k,
        country: c.country ?? null, size: c.size ?? null, sector: c.sector ?? null, linkedinUrl: c.linkedin_url ?? null,
        companyType: c.company_type ?? null, hiring: (c.hiring_signal ?? null) as CompanyRow["hiring"], linkedinOpenings: c.linkedin_openings ?? null,
        status: (w?.status ?? null) as CompanyStatus, note: w?.note ?? "", watching: w?.watching ?? false,
      };
    })
    // Companies with open roles first, then by how many.
    .sort((a, b) => b.roles - a.roles || a.name.localeCompare(b.name));
  const owner = isOwner(user?.email);

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Companies</h1>
        <p className="mt-1 max-w-[62ch] text-muted">Every company you add is saved and checked for jobs every morning, so new roles reach you first.</p>
      </header>

      <div className="mb-6"><CompanyJobsFinder initialName={(sp.find ?? "").slice(0, 100)} /></div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_620px]"><CompaniesList initial={rows} /></div>
        <aside className="flex min-w-[280px] flex-[1_1_320px] flex-col gap-4" aria-label="Add companies">
          {owner ? (
            <>
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
