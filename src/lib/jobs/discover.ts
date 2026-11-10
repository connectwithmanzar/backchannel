import { serviceClient } from "@/lib/supabase/service";
import { isExcludedCompany } from "@/data/companies";
import { JOB_HOSTS, boardName, parseAtsUrl, searchWeb, webSearchConfigured } from "@/lib/websearch";
import { runIngestion } from "@/lib/jobs/ingest";
import { normalise } from "@/lib/jobs/process";
import { jsearchConfigured, listingToRaw, listingsForCompany, searchJSearch } from "@/lib/collectors/jsearch";
import { rateLimitShared } from "@/lib/rate-limit";

export const DISCOVERY_ROLES = [
  "sales development representative", "business development representative", "account executive", "inside sales",
  "sales manager", "account manager", "partnerships manager", "customer success manager",
];
export const DISCOVERY_PLACES = ["India", "Dubai UAE", "United Kingdom", "Germany", "Netherlands", "Singapore", "remote worldwide", "remote EMEA"];

/** Today's slice of role-and-place searches. The slice moves every day, so the whole grid is covered over a few days. */
export function todaysQueries(perRun: number, now = Date.now()): string[] {
  const grid = DISCOVERY_ROLES.flatMap((r) => DISCOVERY_PLACES.map((p) => `${r} ${p}`));
  const start = (Math.floor(now / 864e5) * perRun) % grid.length;
  return Array.from({ length: Math.min(perRun, grid.length) }, (_, i) => grid[(start + i) % grid.length]);
}

export interface Found { ats: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday"; slug: string }

/** Unique company boards behind a set of job-page links, skipping boards we already watch. */
export function newBoards(urls: string[], known: Set<string>): Found[] {
  const out = new Map<string, Found>();
  for (const u of urls) {
    const f = parseAtsUrl(u);
    if (!f) continue;
    const key = `${f.ats}/${f.slug.toLowerCase()}`;
    if (!known.has(key) && !out.has(key)) out.set(key, f);
  }
  return [...out.values()];
}

/**
 * Searches job pages for sales roles in your target places, finds the company boards behind them, adds the new ones,
 * and collects their roles. Each search uses one Tavily credit.
 */
export async function discoverCompanies(opts: { maxSearches?: number; maxNew?: number } = {}) {
  if (!webSearchConfigured()) return { searches: 0, found: 0, added: 0, sales_roles: 0, note: "Web search isn't set up (TAVILY_API_KEY)." };
  const svc = serviceClient();
  const { data: existing } = await svc.from("companies").select("ats_type, ats_slug");
  const known = new Set((existing ?? []).filter((c) => c.ats_type && c.ats_slug).map((c) => `${c.ats_type}/${String(c.ats_slug).toLowerCase()}`));

  const queries = todaysQueries(opts.maxSearches ?? 25);
  const urls: string[] = [];
  let searches = 0, failures = 0;
  const ATS_HOSTS = JOB_HOSTS.filter((h) => /greenhouse|lever|ashbyhq|smartrecruiters|myworkdayjobs/.test(h));
  for (const q of queries) {
    try { urls.push(...(await searchWeb(q, { max: 20, kind: "jobs", includeDomains: ATS_HOSTS })).map((r) => r.url)); searches++; }
    catch { if (++failures >= 3) break; }
  }
  const boards = newBoards(urls, known).filter((b) => !isExcludedCompany(boardName(b), b.slug)).slice(0, opts.maxNew ?? 60);
  const ids: string[] = [];
  for (const b of boards) {
    const { data, error } = await svc.from("companies").insert({ name: boardName(b), ats_type: b.ats, ats_slug: b.slug, enabled: true }).select("id").single();
    if (!error && data) ids.push(data.id);
  }
  const run = ids.length ? await runIngestion({ companyIds: ids, repair: false }) : null;
  return { searches, found: boards.length, added: ids.length, sales_roles: run?.sales_roles ?? 0 };
}

const MONTH = 30 * 864e5;
// The free job-listing plan allows 200 requests a month: 80 go to this scan, 100 to your own searches, 20 stay spare.
export const SCAN_MONTHLY_CAP = 80;
export const SCAN_STALE_DAYS = 14;

/**
 * Companies with no public job board are scanned in rotation through the job-listings feed: the ones checked longest ago
 * first, a few each day. Roles that stop appearing for two weeks are closed.
 */
export async function scanBoardlessCompanies(opts: { maxCompanies?: number } = {}) {
  if (!jsearchConfigured()) return { scanned: 0, saved: 0, note: "Job listings feed isn't set up (JSEARCH_API_KEY)." };
  const svc = serviceClient();
  const { data: due } = await svc.from("companies").select("id, name, domain").eq("enabled", true).is("ats_slug", null)
    .order("last_collected_at", { ascending: true, nullsFirst: true }).limit(opts.maxCompanies ?? 3);
  let scanned = 0, saved = 0;
  const now = new Date().toISOString();
  for (const c of due ?? []) {
    if (isExcludedCompany(c.name, c.domain)) continue;
    if (!(await rateLimitShared("jsearch:scan", SCAN_MONTHLY_CAP, MONTH))) return { scanned, saved, note: "This month's scan allowance is used up." };
    try {
      const { shown } = listingsForCompany(await searchJSearch(`sales jobs at ${c.name}`), c.name);
      const rows = shown.map((l) => ({ company_id: c.id, ...normalise(listingToRaw(l), c.name), source_type: "public" as const, source: "jsearch", company_name: c.name, added_by: null, last_checked_at: now, is_active: true }));
      const unique = [...new Map(rows.map((r) => [r.dedupe_hash, r])).values()];
      if (unique.length) await svc.from("jobs").upsert(unique, { onConflict: "dedupe_hash" });
      await svc.from("companies").update({ last_collected_at: now, collect_error: null, open_sales_roles: unique.length }).eq("id", c.id);
      scanned++; saved += unique.length;
    } catch (e) {
      await svc.from("companies").update({ last_collected_at: now, collect_error: (e as Error).message.slice(0, 200) }).eq("id", c.id);
    }
  }
  const cutoff = new Date(Date.now() - SCAN_STALE_DAYS * 864e5).toISOString();
  await svc.from("jobs").update({ is_active: false }).eq("source", "jsearch").eq("is_active", true).lt("last_checked_at", cutoff);
  return { scanned, saved };
}
