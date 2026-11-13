import type { SupabaseClient } from "@supabase/supabase-js";
import { getFocusJobs, getSharedJobs, JOB_COLUMNS } from "@/lib/jobs/shared-cache";
import { scoreJob, buildSearchProfile } from "@/lib/score";
import { toRoleFamily } from "@/lib/jobs/scoring";
import { applyFeedback } from "@/lib/feedback";
import { companyQuality, signalsFromRows } from "@/lib/companyQuality";
import { toMarket } from "@/lib/jobs/market";
import type { Job, RemoteType } from "@/lib/collector/types";
import { htmlToText } from "@/lib/collector/fetchers";
import { formatCompanyName } from "@/lib/company-name";
import { classifyRelevance } from "@/lib/relevance";
import { effectiveTier, type Tier } from "@/lib/company-rating";
import { seniorityOf } from "@/lib/role-filters";
import { formatPay } from "@/lib/currency";
import { isExcludedCompany } from "@/data/companies";

/** One job as a swipe card shows it. */
export interface SwipeJob {
  id: string;
  company: string;
  title: string;
  location: string;
  workMode: string | null;
  level: string;
  pay: string | null;
  postedAt: string | null;
  /** 0 to 100, how well it fits your profile. */
  score: number;
  /** One plain sentence on why it fits. */
  why: string;
  /** Short reasons it fits, and things to watch, shown as ticks and cautions. */
  reasons: string[];
  caveats: string[];
  tags: string[];
  /** The start of the job description, plain text. */
  description: string;
  url: string;
  market: string;
  tier: Tier | null;
}

const LEVEL: Record<string, string> = { entry: "Entry level", mid: "Mid level", senior: "Senior", lead: "Lead" };
const WORK: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const DEFAULT_MARKETS = ["india", "remote-in", "global"];
const MAX_CARDS = 120;

/** Posted-time text such as "Posted today" or "3 days ago". */
export function postedAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const days = Math.floor((now - Date.parse(iso)) / 864e5);
  if (!Number.isFinite(days) || days < 0) return "";
  return days === 0 ? "Posted today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

type Row = Awaited<ReturnType<typeof getSharedJobs>>[number];

/**
 * The deck: relevant roles in your markets that you have not passed on, saved or applied to yet, best fit first.
 * Roles at the companies you watch come first, then the jobs you sent from JobRadar, then the newest others.
 */
export async function loadSwipeFeed(db: SupabaseClient, userId: string): Promise<SwipeJob[]> {
  const [{ data: profileRow }, sharedJobs, { data: ownJobs }, { data: scoreRows }, watchRes] = await Promise.all([
    db.from("profiles").select("name, tools, markets, target_titles, min_ote_usd, min_ote_by_market").maybeSingle(),
    getSharedJobs(),
    db.from("jobs").select(JOB_COLUMNS).eq("is_active", true).not("added_by", "is", null).limit(1000),
    db.from("job_scores").select("job_id, score, explanation, reaction").eq("user_id", userId).limit(5000),
    db.from("watchlist").select("company_id, tier").eq("user_id", userId).eq("watching", true),
  ]);
  const watchRows = (watchRes.error
    ? (((await db.from("watchlist").select("company_id").eq("user_id", userId).eq("watching", true)).data ?? []) as { company_id: string; tier?: string | null }[])
    : ((watchRes.data ?? []) as { company_id: string; tier?: string | null }[]));
  const watched = new Set(watchRows.map((w) => w.company_id));
  const focusJobs = await getFocusJobs([...watched]);

  const reactions = new Map((scoreRows ?? []).map((r) => [r.job_id as string, r as { score: number | null; explanation: string | null; reaction: string | null }]));
  const seen = new Set<string>();
  const focusIds = new Set(focusJobs.map((r) => r.id));
  const ownIds = new Set((ownJobs ?? []).map((r) => r.id));
  const merged = ([...focusJobs, ...(ownJobs ?? []), ...sharedJobs] as Row[]).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const rank = (r: Row) => (focusIds.has(r.id) ? 0 : ownIds.has(r.id) ? 1 : 2);
  merged.sort((a, b) => rank(a) - rank(b) || (b.last_checked_at ?? "").localeCompare(a.last_checked_at ?? ""));

  const profile = buildSearchProfile(profileRow);
  const wanted = new Set<string>(profile.markets.length ? profile.markets : DEFAULT_MARKETS);
  const tierOf = new Map(watchRows.map((w) => [w.company_id, effectiveTier(w.tier, null).tier] as const));

  const visible = merged.filter((row) => {
    const company = (row.companies as unknown as { name: string } | null)?.name ?? row.company_name;
    if (isExcludedCompany(company, row.url)) return false;
    const rx = reactions.get(row.id)?.reaction;
    if (rx === "skipped" || rx === "applied" || rx === "bookmarked") return false;
    if (!classifyRelevance(row.title, company ?? "", htmlToText(row.description ?? "").slice(0, 1200)).relevant) return false;
    return wanted.has(toMarket(row.market, row.remote_type, row.location));
  }).slice(0, 600);

  const signals = signalsFromRows(visible);
  const jobs: Job[] = visible.map((row) => ({
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
    payMin: row.ote_min ?? row.base_min ?? undefined,
    payMax: row.ote_max ?? row.base_max ?? undefined,
    payKind: (row.ote_max ?? row.ote_min) != null ? "ote" : "base",
    payBandStatus: row.pay_band_status === "verified" ? "verified" : "unknown",
    visaSponsorship: (row.visa_sponsorship ?? "unknown") as "yes" | "no" | "unknown",
    roleFamily: toRoleFamily(row.title),
    description: htmlToText(row.description ?? ""),
    companyQuality: companyQuality(signals.get(row.company_id ?? "")),
  }));

  const rankedBy = applyFeedback(jobs.map((j) => scoreJob(j, profile)), Object.fromEntries(reactions));
  const companyOf = new Map(visible.map((r) => [r.id, r.company_id as string | null]));
  return rankedBy
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CARDS)
    .map((j): SwipeJob => ({
      id: j.id,
      company: j.company,
      title: j.title,
      location: j.location || "Location not stated",
      workMode: WORK[j.remoteType] ?? null,
      level: LEVEL[seniorityOf(j.title)] ?? "Mid level",
      pay: j.payMax ? formatPay(j.payMin, j.payMax, j.currency, "INR") || null : null,
      postedAt: j.postedAt ?? null,
      score: j.score,
      why: reactions.get(j.id)?.explanation?.trim() || j.explanation,
      reasons: j.reasons,
      caveats: j.caveats,
      tags: [...new Set([...j.matchedTools, j.roleFamily])].slice(0, 6),
      description: j.description.slice(0, 1600),
      url: j.url,
      market: j.market,
      tier: tierOf.get(companyOf.get(j.id) ?? "") ?? null,
    }));
}
