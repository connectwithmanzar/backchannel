import { serviceClient } from "@/lib/supabase/service";
import { isExcludedCompany } from "@/data/companies";
import { JOB_HOSTS, parseAtsUrl, prettifySlug, searchWeb, webSearchConfigured } from "@/lib/websearch";
import { runIngestion } from "@/lib/jobs/ingest";

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

export interface Found { ats: "greenhouse" | "lever" | "ashby" | "smartrecruiters"; slug: string }

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
  const ATS_HOSTS = JOB_HOSTS.filter((h) => /greenhouse|lever|ashbyhq|smartrecruiters/.test(h));
  for (const q of queries) {
    try { urls.push(...(await searchWeb(q, { max: 20, kind: "jobs", includeDomains: ATS_HOSTS })).map((r) => r.url)); searches++; }
    catch { if (++failures >= 3) break; }
  }
  const boards = newBoards(urls, known).filter((b) => !isExcludedCompany(prettifySlug(b.slug), b.slug)).slice(0, opts.maxNew ?? 60);
  const ids: string[] = [];
  for (const b of boards) {
    const { data, error } = await svc.from("companies").insert({ name: prettifySlug(b.slug), ats_type: b.ats, ats_slug: b.slug, enabled: true }).select("id").single();
    if (!error && data) ids.push(data.id);
  }
  const run = ids.length ? await runIngestion({ companyIds: ids, repair: false }) : null;
  return { searches, found: boards.length, added: ids.length, sales_roles: run?.sales_roles ?? 0 };
}
