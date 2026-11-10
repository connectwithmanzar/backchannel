import { createClient } from "@/lib/supabase/server";
import ScopeSwitch from "@/components/ScopeSwitch";
import WebSearch from "../roles/WebSearch";
import CompanyCard, { type CompanyData } from "./CompanyCard";
import CurateButton from "./CurateButton";
import { isExcludedCompany } from "@/data/companies";

export const dynamic = "force-dynamic";


type DbInsight = {
  user_id: string;
  company_id: string;
  why_great: string | null;
  criteria_tags: string[] | null;
  awards: { name: string; year?: number; source_url?: string }[] | null;
  visa_note: string | null;
  hidden: boolean | null;
  companies: {
    id: string;
    name: string;
    domain: string | null;
    country: string | null;
    hq: string | null;
    sector: string | null;
  } | null;
};

type DbWatchlist = { company_id: string; watching: boolean };
type DbJob = { company_id: string | null };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const filter = params.filter ?? "all";

  const { data: { user } } = await supabase.auth.getUser();

  const [insightsRes, watchlistRes, jobsRes] = await Promise.all([
    supabase
      .from("company_insights")
      .select("user_id, company_id, why_great, criteria_tags, awards, visa_note, hidden, companies(id, name, domain, country, hq, sector)")
      .eq("hidden", false),
    supabase.from("watchlist").select("company_id, watching"),
    supabase.from("jobs").select("company_id").eq("is_active", true),
  ]);

  const watchMap: Record<string, boolean> = {};
  for (const w of (watchlistRes.data ?? []) as DbWatchlist[]) {
    watchMap[w.company_id] = w.watching;
  }

  const jobCountMap: Record<string, number> = {};
  for (const j of (jobsRes.data ?? []) as DbJob[]) {
    if (j.company_id) jobCountMap[j.company_id] = (jobCountMap[j.company_id] ?? 0) + 1;
  }

  const companies: CompanyData[] = ((insightsRes.data ?? []) as unknown as DbInsight[])
    .filter((r) => r.companies !== null && !isExcludedCompany(r.companies.name, r.companies.domain))
    .map((r) => {
      const co = r.companies!;
      return {
        id: co.id,
        name: co.name,
        domain: co.domain,
        country: co.country,
        hq: co.hq,
        sector: co.sector,
        why_great: r.why_great,
        criteria_tags: r.criteria_tags ?? [],
        awards: (r.awards as { name: string; year?: number; source_url?: string }[]) ?? [],
        visa_note: r.visa_note,
        watching: watchMap[co.id] ?? false,
        open_jobs: jobCountMap[co.id] ?? 0,
      };
    });

  const filtered = filter === "hiring"
    ? companies.filter((c) => c.open_jobs > 0)
    : filter === "not-hiring"
    ? companies.filter((c) => c.open_jobs === 0)
    : filter === "watching"
    ? companies.filter((c) => c.watching)
    : companies;

  const tabs = [
    { id: "all", label: "All", count: companies.length },
    { id: "hiring", label: "Hiring now", count: companies.filter((c) => c.open_jobs > 0).length },
    { id: "not-hiring", label: "Not hiring yet", count: companies.filter((c) => c.open_jobs === 0).length },
    { id: "watching", label: "Watching", count: companies.filter((c) => c.watching).length },
  ];

  return (
    <section className="py-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">
        AI-curated on request
      </div>
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Great companies</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Companies that match your criteria, curated by AI. Watch them to get
        signals when they fund, expand, or open roles.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {user && <CurateButton />}
      </div>

      <div className="mt-6">
      <ScopeSwitch mineLabel="My companies" mine={<>
      {/* Filter tabs */}
      <div className="mt-6 flex flex-wrap gap-1 border-b border-line pb-1">
        {tabs.map((t) => {
          const on = t.id === filter;
          return (
            <a
              key={t.id}
              href={`/companies?filter=${t.id}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-accent-soft text-fg"
                  : "text-muted hover:text-fg"
              }`}
            >
              {t.label}
              <span className="ml-1 num text-xs opacity-60">{t.count}</span>
            </a>
          );
        })}
      </div>

      {/* Company grid */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-card bg-signal-soft px-4 py-6 text-center text-sm text-signal">
          {companies.length === 0 ? (
            <>
              <p className="font-semibold">No companies curated yet.</p>
              <p className="mt-1 text-muted">Click <b>Find more companies with AI</b> above to get started.</p>
            </>
          ) : (
            <p>No companies match this filter.</p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      )}
      </>} web={<WebSearch kind="companies" />} />
      </div>
    </section>
  );
}
