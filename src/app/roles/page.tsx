import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getSharedJobs, JOB_COLUMNS } from "@/lib/jobs/shared-cache";
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
import { COMPANY_SEEDS, isExcludedCompany } from "@/data/companies";

export const dynamic = "force-dynamic";



export default async function RolesPage({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()]);

  // Independent queries run together instead of one after another.
  const [{ data: profileRow }, sharedJobs, { data: ownJobs }, { data: scoreRows }] = await Promise.all([
    supabase.from("profiles").select("name, tools, markets, target_titles, min_ote_usd, min_ote_by_market").maybeSingle(),
    // Shared jobs come from a 5-minute cache; the jobs you pasted yourself are read fresh (row-level security shows only yours).
    getSharedJobs(),
    supabase.from("jobs").select(JOB_COLUMNS).eq("is_active", true).not("added_by", "is", null),
    user
      ? supabase.from("job_scores").select("job_id, score, parts, explanation, model, reaction").eq("user_id", user.id)
      : Promise.resolve({ data: null }),
  ]);
  const rows = [...sharedJobs, ...(ownJobs ?? [])]
    .sort((a, b) => (b.last_checked_at ?? "").localeCompare(a.last_checked_at ?? ""))
    .slice(0, 500);

  const profile = buildSearchProfile(profileRow);

  // Never surface excluded companies (e.g. Taboola), even if rows exist.
  const visibleRows = (rows ?? []).filter(
    (row) => !isExcludedCompany((row.companies as unknown as { name: string } | null)?.name, row.url)
  );

  const signals = signalsFromRows(visibleRows);
  const jobs: Job[] = visibleRows.map((row) => ({
    id: row.id,
    company: (row.companies as unknown as { name: string } | null)?.name ?? row.company_name ?? "Unknown",
    companyDomain: (row.companies as unknown as { domain: string | null } | null)?.domain ?? undefined,
    title: row.title,
    location: row.location ?? "",
    remoteType: (row.remote_type ?? "unknown") as RemoteType,
    market: toMarket(row.market, row.remote_type),
    sourceType: "careers",
    board: row.board ?? "",
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
    .map((j) => ({ ...j, description: j.description.slice(0, 600) }));

  return (
    <section className="py-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">
        For SDR · BDR · GTM · B2B sales
      </div>
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
        Matching public roles
      </h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Backchannel collects public sales roles from {seedCount} company careers pages and ranks them against your
        profile. For the ones you want, it drafts a tailored CV and a referral message. You review and send.
      </p>
      {lastChecked && (
        <p className="mt-2 text-sm text-muted num">Roles last collected {shortDateTime(lastChecked)}.</p>
      )}
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

      <PasteJob /><AlertImport />

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

      <CompanyJobsFinder />
      <ScopeSwitch mineLabel="My roles" mine={<RolesFeed jobs={scored} reactions={reactions} defaultMarkets={profile.markets} initialQuery={(sp.q ?? "").slice(0, 100)} initialSaved={sp.saved === "1"} />} web={<WebSearch kind="jobs" />} />
    </section>
  );
}
