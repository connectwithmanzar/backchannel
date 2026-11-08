import { createClient } from "@/lib/supabase/server";
import { scoreJob, type SearchProfile } from "@/lib/score";
import type { Job, Market, RemoteType, RoleFamily } from "@/lib/collector/types";
import { htmlToText } from "@/lib/collector/fetchers";
import RolesFeed, { type JobReaction } from "./RolesFeed";
import RunNowButton from "./RunNowButton";
import ScoreNowButton from "./ScoreNowButton";
import TelegramButton from "./TelegramButton";
import { isTelegramConfigured } from "@/lib/telegram";
import { isOwner } from "@/lib/owner";
import { COMPANY_SEEDS, isExcludedCompany } from "@/data/companies";

export const dynamic = "force-dynamic";

// Map freeform DB market strings → typed Market enum
function toMarket(m: string): Market {
  const l = (m ?? "").toLowerCase();
  if (l === "india" || l === "remote-in") return "india";
  if (l === "remote") return "remote-in";
  if (l === "us" || l === "usa" || l === "united states") return "us";
  if (
    ["uk", "united kingdom", "germany", "france", "netherlands", "ireland",
     "spain", "emea", "europe", "denmark", "sweden", "switzerland", "poland",
     "austria", "belgium", "italy", "portugal", "uae", "israel"].some(
      (c) => l.includes(c)
    )
  )
    return "emea";
  return "global";
}

// Map a user preference country label → Market
function countryToMarket(country: string): Market {
  const c = country.toLowerCase();
  if (c === "india") return "india";
  if (c === "united states") return "us";
  if (
    ["united kingdom", "germany", "netherlands", "france", "ireland", "spain",
     "uae", "singapore"].some((x) => c.includes(x))
  )
    return "emea";
  if (c === "canada" || c === "australia") return "global";
  return "global";
}

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
  const supabase = await createClient();

  // Load user profile for scoring (silent fail → sensible defaults)
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("name, tools, markets, min_ote_usd")
    .maybeSingle();

  const profile: SearchProfile = {
    name: profileRow?.name ?? "You",
    targetFamilies: ["SDR/BDR", "GTM Engineer", "Account Executive"],
    markets: (profileRow?.markets ?? []).map(countryToMarket),
    tools: profileRow?.tools ?? [],
    minOteUsd: profileRow?.min_ote_usd ?? 0,
    prefersRemote: false,
  };

  // Load active jobs with company name
  const { data: rows } = await supabase
    .from("jobs")
    .select("*, companies(name)")
    .eq("is_active", true)
    .order("last_checked_at", { ascending: false })
    .limit(500);

  // Never surface excluded companies (e.g. Taboola), even if rows exist.
  const visibleRows = (rows ?? []).filter(
    (row) => !isExcludedCompany((row.companies as { name: string } | null)?.name, row.url)
  );

  const jobs: Job[] = visibleRows.map((row) => ({
    id: row.id,
    company: (row.companies as { name: string } | null)?.name ?? "Unknown",
    title: row.title,
    location: row.location ?? "",
    remoteType: (row.remote_type ?? "unknown") as RemoteType,
    market: toMarket(row.market ?? ""),
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
  }));

  const scored = jobs
    .map((j) => scoreJob(j, profile))
    .sort((a, b) => b.score - a.score);

  const lastChecked = visibleRows[0]?.last_checked_at ?? null;
  const seedCount = COMPANY_SEEDS.filter(
    (s) => s.enabled && !isExcludedCompany(s.name, s.domain, s.ats_slug)
  ).length;

  // Load this user's existing job scores / reactions
  const { data: { user } } = await supabase.auth.getUser();
  const owner = isOwner(user?.email);
  const reactions: Record<string, JobReaction> = {};
  if (user) {
    const { data: scoreRows } = await supabase
      .from("job_scores")
      .select("job_id, score, parts, explanation, model, reaction")
      .eq("user_id", user.id);

    for (const row of scoreRows ?? []) {
      reactions[row.job_id] = {
        job_id: row.job_id,
        reaction: row.reaction ?? null,
        score: row.score ?? undefined,
        explanation: row.explanation ?? undefined,
        model: row.model ?? undefined,
      };
    }
  }

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
