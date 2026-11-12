import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getFocusJobs, getSharedJobs, JOB_COLUMNS } from "@/lib/jobs/shared-cache";
import { scoreJob, buildSearchProfile } from "@/lib/score";
import { toRoleFamily } from "@/lib/jobs/scoring";
import { applyFeedback } from "@/lib/feedback";
import { companyQuality, signalsFromRows } from "@/lib/companyQuality";
import { toMarket } from "@/lib/jobs/market";
import type { Job, RemoteType } from "@/lib/collector/types";
import { htmlToText } from "@/lib/collector/fetchers";
import { shortDateTime } from "@/lib/format";
import RolesFeed, { type JobReaction } from "./RolesFeed";
import RunNowButton from "./RunNowButton";
import PasteJob from "./PasteJob";
import AlertImport from "./AlertImport";
import WebSearch from "./WebSearch";
import CompanyJobsFinder from "./CompanyJobsFinder";
import ScopeSwitch from "@/components/ScopeSwitch";
import ScoreNowButton from "./ScoreNowButton";
import TelegramButton from "./TelegramButton";
import { isTelegramConfigured } from "@/lib/telegram";
import { isOwner } from "@/lib/owner";
import { effectiveTier, type Tier } from "@/lib/company-rating";
import { formatCompanyName } from "@/lib/company-name";
import { classifyRelevance } from "@/lib/relevance";
import { COMPANY_SEEDS, isExcludedCompany } from "@/data/companies";

export const dynamic = "force-dynamic";



export default async function RolesPage({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string; all?: string }> }) {
  const sp = await searchParams;
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()]);

  // Independent queries run together instead of one after another.
  const [{ data: profileRow }, sharedJobs, { data: ownJobs }, { data: scoreRows }, watchRes] = await Promise.all([
    supabase.from("profiles").select("name, tools, markets, target_titles, min_ote_usd, min_ote_by_market").maybeSingle(),
    // Shared jobs come from a 5-minute cache; the jobs you pasted yourself are read fresh (row-level security shows only yours).
    getSharedJobs(),
    supabase.from("jobs").select(JOB_COLUMNS).eq("is_active", true).not("added_by", "is", null),
    user
      ? supabase.from("job_scores").select("job_id, score, parts, explanation, model, reaction").eq("user_id", user.id)
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("watchlist").select("company_id, tier").eq("user_id", user.id).eq("watching", true)
      : Promise.resolve({ data: null, error: null }),
  ]);
  // Roles at the companies you watch (your target list) come first on the Jobs page.
  // Tiers arrive with migration 0017. Until it is run, read the plain watch list instead.
  type Watch = { company_id: string; tier?: string | null };
  const watchRows: Watch[] = watchRes.error && user
    ? (((await supabase.from("watchlist").select("company_id").eq("user_id", user.id).eq("watching", true)).data ?? []) as Watch[])
    : ((watchRes.data ?? []) as Watch[]);
  const watched = new Set(watchRows.map((w) => w.company_id));

  // The shared list holds only the newest 500 roles, so the roles at your watched companies, and at any company you
  // searched for, are loaded on their own and always included.
  const focusJobs = await getFocusJobs([...watched], sp.q);
  const seenIds = new Set<string>();
  const merged = [...focusJobs, ...sharedJobs, ...(ownJobs ?? [])].filter((r) => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)));
  // Order: your watched companies, then the jobs you sent from JobRadar or pasted yourself (all of them), then the newest others.
  const focusIds = new Set(focusJobs.map((r) => r.id));
  const ownIds = new Set((ownJobs ?? []).map((r) => r.id));
  const byNewest = (x: { last_checked_at?: string | null }, y: { last_checked_at?: string | null }) => (y.last_checked_at ?? "").localeCompare(x.last_checked_at ?? "");
  const rows = [
    ...merged.filter((r) => focusIds.has(r.id)),
    ...merged.filter((r) => !focusIds.has(r.id) && ownIds.has(r.id)).sort(byNewest),
    ...merged.filter((r) => !focusIds.has(r.id) && !ownIds.has(r.id)).sort(byNewest),
  ].slice(0, 1000);

  const profile = buildSearchProfile(profileRow);

  // Never surface excluded companies (e.g. Taboola), even if rows exist.
  const visibleRows = (rows ?? []).filter(
    (row) => !isExcludedCompany((row.companies as unknown as { name: string } | null)?.name, row.url)
  );

  // Ratings you saved decide a suggested tier (migration 0018). Until it is run, only the tiers you set count.
  const ratingRes = user && watched.size ? await supabase.from("company_research").select("company_id, glassdoor_rating, ambitionbox_rating").eq("user_id", user.id) : null;
  const ratingBy = new Map((ratingRes?.error ? [] : ratingRes?.data ?? []).map((r) => [r.company_id as string, r]));
  const tierOf = new Map<string, { tier: Tier | null; suggested: boolean }>();
  for (const w of watchRows) tierOf.set(w.company_id, effectiveTier(w.tier, ratingBy.get(w.company_id)));
  // Tier D means skip, so those companies never show under Priority.
  const priorityIds = visibleRows.filter((row) => row.company_id && watched.has(row.company_id) && tierOf.get(row.company_id)?.tier !== "D").map((row) => row.id);
  const tierById: Record<string, Tier> = {};
  const suggestedIds: string[] = [];
  for (const row of visibleRows) {
    const t = row.company_id ? tierOf.get(row.company_id) : undefined;
    if (t?.tier) { tierById[row.id] = t.tier; if (t.suggested) suggestedIds.push(row.id); }
  }

  const signals = signalsFromRows(visibleRows);
  const jobs: Job[] = visibleRows.map((row) => ({
    id: row.id,
    company: formatCompanyName((row.companies as unknown as { name: string } | null)?.name ?? row.company_name) || "Unknown",
    companyDomain: (row.companies as unknown as { domain: string | null } | null)?.domain ?? undefined,
    title: row.title,
    location: row.location ?? "",
    remoteType: (row.remote_type ?? "unknown") as RemoteType,
    market: toMarket(row.market, row.remote_type, row.location),
    sourceType: "careers",
    board: row.board ?? "",
    source: (row as { source?: string | null }).source ?? undefined,
    url: row.url ?? "",
    postedAt: row.posted_at ?? undefined,
    lastCheckedAt: row.last_checked_at ?? new Date().toISOString(),
    currency: row.currency ?? undefined,
    // Prefer OTE for AE/sales roles; fall back to base pay
    payMin: row.ote_min ?? row.base_min ?? undefined,
    payMax: row.ote_max ?? row.base_max ?? undefined,
    payKind: (row.ote_max ?? row.ote_min) != null ? "ote" : "base",
    payBandStatus:
      row.pay_band_status === "verified"
        ? "verified"
        : "unknown",
    visaSponsorship: (row.visa_sponsorship ?? "unknown") as "yes" | "no" | "unknown",
    roleFamily: toRoleFamily(row.title),
    description: htmlToText(row.description ?? ""),
    companyQuality: companyQuality(signals.get(row.company_id ?? "")),
  }));

  const scoredBase = jobs.map((j) => scoreJob(j, profile));

  const lastChecked = visibleRows[0]?.last_checked_at ?? null;
  const seedCount = COMPANY_SEEDS.filter(
    (s) => s.enabled && !isExcludedCompany(s.name, s.domain, s.ats_slug)
  ).length;

  // Load this user's existing job scores / reactions
  const owner = isOwner(user?.email);
  const reactions: Record<string, JobReaction> = {};
  for (const row of scoreRows ?? []) {
    reactions[row.job_id] = {
      job_id: row.job_id,
      reaction: row.reaction ?? null,
      score: row.score ?? undefined,
      explanation: row.explanation ?? undefined,
      model: row.model ?? undefined,
    };
  }

  // What you skip or save at a company nudges its other roles, and the explanation says so.
  const scored = applyFeedback(scoredBase, reactions)
    .sort((a, b) => b.score - a.score)
    // Scoring used the full text; the browser only needs a short preview.
    .map((j) => ({ ...j, relevant: classifyRelevance(j.title, j.company, j.description).relevant, description: j.description.slice(0, 600) }));
  // Only the roles that fit you are sent unless you ask for everything. That keeps the page quick.
  const showAll = sp.all === "1";
  const totalCount = scored.length;
  const feed = showAll ? scored : scored.filter((j) => j.relevant || j.source === "pasted" || reactions[j.id]?.reaction === "bookmarked");

  return (
    <section className="py-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">
        SDR · BDR · GTM · Inside sales · AE · SaaS · Ad sales
      </div>
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
        Jobs
      </h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Roles that match what you are looking for, from company career pages and JobRadar, ranked against your profile.
        &ldquo;Relevant to me&rdquo; hides heads of sales, managers and consumer sales; switch to All kinds of role to see everything.
      </p>
      {lastChecked && (
        <p className="mt-2 text-sm text-muted num">Roles last collected {shortDateTime(lastChecked)}.</p>
      )}
      <p className="mt-1 text-sm text-muted">Showing every role at the companies you watch, then the newest others. To see one company&apos;s roles, search its name below.</p>
      {profile.markets.length > 0 && (
        <p className="mt-1 text-sm text-muted">Showing your markets first. Tap a market below to change it.</p>
      )}
      {owner && (
        <details className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">Admin tools</summary>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <RunNowButton />
            <ScoreNowButton />
            <TelegramButton configured={isTelegramConfigured()} />
            <a href="/sources" className="font-semibold text-accent underline-offset-2 hover:underline">Company sources →</a>
          </div>
        </details>
      )}

      <details className="mt-4 rounded-card border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">+ Add a job, or find a company&apos;s roles</summary>
        <div className="border-t border-line px-4 pb-4">
          <PasteJob /><AlertImport />
          <CompanyJobsFinder />
        </div>
      </details>

      {jobs.length === 0 && (
        <div className="mt-4 rounded-card bg-signal-soft px-4 py-3 text-sm text-signal">
          No roles collected yet.{" "}
          {owner ? (
            <>
              <b>Click &quot;Run now&quot; above</b> to fetch public roles from the{" "}
              {seedCount}-company list — takes about 90 seconds.
            </>
          ) : (
            <>Roles appear after the next daily collection.</>
          )}
        </div>
      )}

      <ScopeSwitch mineLabel="My roles" mine={<RolesFeed jobs={feed} showAll={showAll} totalCount={totalCount} reactions={reactions} defaultMarkets={profile.markets.length ? profile.markets : ["india", "remote-in", "global"]} initialQuery={(sp.q ?? "").slice(0, 100)} initialSaved={sp.saved === "1"} priorityIds={priorityIds} tierById={tierById} suggestedIds={suggestedIds} />} web={<WebSearch kind="jobs" />} />
    </section>
  );
}
