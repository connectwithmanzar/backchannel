import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getSharedJobs, JOB_COLUMNS } from "@/lib/jobs/shared-cache";
import { scoreJob, parseMinOteByMarket, type SearchProfile } from "@/lib/score";
import { companyQuality, signalsFromRows } from "@/lib/companyQuality";
import { toMarket, countryToMarkets } from "@/lib/jobs/market";
import type { Job, Market, RemoteType, RoleFamily } from "@/lib/collector/types";
import { htmlToText } from "@/lib/collector/fetchers";
import RolesFeed, { type JobReaction } from "./RolesFeed";
import RunNowButton from "./RunNowButton";
import PasteJob from "./PasteJob";
import ScoreNowButton from "./ScoreNowButton";
import TelegramButton from "./TelegramButton";
import { isTelegramConfigured } from "@/lib/telegram";
import { isOwner } from "@/lib/owner";
import { COMPANY_SEEDS, isExcludedCompany } from "@/data/companies";

export const dynamic = "force-dynamic";



// Classify a job title into a sales role family
function toRoleFamily(title: string): RoleFamily {
  const t = title.toLowerCase();
  if (
    /\b(sdr|bdr|sales development|business development rep|inside sales|market development|lead development)\b/.test(
      t
    )
  )
    return "SDR/BDR";
  if (
    /\b(account executive|\bae\b|new business sales|sales executive)\b/.test(t)
  )
    return "Account Executive";
  if (
    /\b(gtm|go.to.market) (engineer|systems|operations)\b|\brevops engineer\b|\bgrowth engineer\b/i.test(
      t
    )
  )
    return "GTM Engineer";
  if (
    /\b(vp|vice president|head of|director).{0,20}(sales|revenue|growth)\b/i.test(
      t
    )
  )
    return "Sales leadership";
  return "Other sales";
}

export default async function RolesPage() {
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const mark = <T,>(label: string, p: PromiseLike<T>) => Promise.resolve(p).then((v) => { marks[label] = Date.now() - t0; return v; });
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()]);
  marks.client = Date.now() - t0;

  // Independent queries run together instead of one after another.
  const [{ data: profileRow }, sharedJobs, { data: ownJobs }, { data: scoreRows }] = await Promise.all([
    mark("profile", supabase.from("profiles").select("name, tools, markets, min_ote_usd, min_ote_by_market").maybeSingle()),
    // Shared jobs come from a 5-minute cache; the jobs you pasted yourself are read fresh (row-level security shows only yours).
    mark("shared", getSharedJobs()),
    mark("own", supabase.from("jobs").select(JOB_COLUMNS).eq("is_active", true).not("added_by", "is", null)),
    user
      ? mark("scores", supabase.from("job_scores").select("job_id, score, parts, explanation, model, reaction").eq("user_id", user.id))
      : Promise.resolve({ data: null }),
  ]);
  const rows = [...sharedJobs, ...(ownJobs ?? [])]
    .sort((a, b) => (b.last_checked_at ?? "").localeCompare(a.last_checked_at ?? ""))
    .slice(0, 500);

  const profile: SearchProfile = {
    name: profileRow?.name ?? "You",
    targetFamilies: ["SDR/BDR", "GTM Engineer", "Account Executive"],
    markets: [...new Set<Market>((profileRow?.markets ?? []).flatMap(countryToMarkets))],
    tools: profileRow?.tools ?? [],
    minOteUsd: profileRow?.min_ote_usd ?? 0,
    minOteByMarket: parseMinOteByMarket(profileRow?.min_ote_by_market),
    prefersRemote: false,
  };

  // Never surface excluded companies (e.g. Taboola), even if rows exist.
  const visibleRows = (rows ?? []).filter(
    (row) => !isExcludedCompany((row.companies as unknown as { name: string } | null)?.name, row.url)
  );

  const signals = signalsFromRows(visibleRows);
  const jobs: Job[] = visibleRows.map((row) => ({
    id: row.id,
    company: (row.companies as unknown as { name: string } | null)?.name ?? row.company_name ?? "Unknown",
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
    payBandStatus:
      row.pay_band_status === "verified"
        ? "verified"
        : "unknown",
    visaSponsorship: (row.visa_sponsorship ?? "unknown") as "yes" | "no" | "unknown",
    roleFamily: toRoleFamily(row.title),
    description: htmlToText(row.description ?? ""),
    companyQuality: companyQuality(signals.get(row.company_id ?? "")),
  }));

  const scored = jobs
    .map((j) => scoreJob(j, profile))
    .sort((a, b) => b.score - a.score)
    // Scoring used the full text; the browser only needs a short preview.
    .map((j) => ({ ...j, description: j.description.slice(0, 600) }));

  marks.scored = Date.now() - t0;
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

  console.log(JSON.stringify({ page: "roles-timing", totalMs: Date.now() - t0, marks, rows: (rows ?? []).length, descKB: Math.round((rows ?? []).reduce((n, r) => n + (r.description?.length ?? 0), 0) / 1024) }));
  return (
    <section className="py-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">
        For SDR · BDR · GTM · B2B sales
      </div>
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
        Matching public roles
      </h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        It finds matching public roles and drafts a truthful CV plus a referral
        ask you send, and you apply yourself. Roles come from public company
        careers pages ({seedCount} companies) and are ranked against your profile.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {owner && <RunNowButton />}
        {owner && <ScoreNowButton />}
        <TelegramButton configured={isTelegramConfigured()} />
        <a href="/sources" className="text-sm font-semibold text-accent underline-offset-2 hover:underline">Job sources →</a>
        {lastChecked && (
          <p className="text-sm text-muted num">
            Last collected{" "}
            {new Date(lastChecked).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </p>
        )}
      </div>

      <PasteJob />

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

      <RolesFeed jobs={scored} reactions={reactions} />
    </section>
  );
}
