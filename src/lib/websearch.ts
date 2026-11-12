// Open-web search through Tavily, a licensed search API. We only ask it for links and short snippets.
// It never opens LinkedIn, and LinkedIn results are dropped, in line with the no-LinkedIn rule.
const ENDPOINT = "https://api.tavily.com/search";

export const BLOCKED_HOSTS = ["linkedin.com"];
// Pages that are never a job or a company worth adding: the search provider's own profiles and social posts.
const NOISE_HOSTS = ["tavily.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com", "pinterest.com"];
const JOB_HINT = /\b(jobs?|careers?|vacanc\w*|hiring|apply|openings?|positions?|roles?)\b/i;

// Hosts that carry real job postings. A job search limited to these returns postings, not blog posts or listicles.
export const JOB_HOSTS = [
  "boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", "apply.workable.com", "jobs.smartrecruiters.com",
  "careers.smartrecruiters.com", "myworkdayjobs.com", "jobs.jobvite.com", "recruitee.com", "teamtailor.com", "breezy.hr", "bamboohr.com",
  "personio.de", "personio.com", "join.com", "pinpointhq.com", "jobs.workable.com", "builtin.com", "himalayas.app", "remoteok.com", "weworkremotely.com",
  "welcometothejungle.com", "otta.com", "wellfound.com", "instahyre.com", "cutshort.io", "foundit.in", "naukrigulf.com", "bayt.com", "gulftalent.com",
  "hirist.tech", "founditgulf.com", "laimoon.com", "tanqeeb.com", "akhtaboot.com", "mihnati.com", "startup.jobs", "workatastartup.com", "jobspresso.co", "hasjob.co",
  "magnitt.com", "wamda.com", "revgenius.com", "joinpavilion.com", "bravado.co",
];

// The ATS hosts whose job pages carry the company's board name, so one result reveals a whole company's board.
import { parseWorkdayUrl, splitWorkdaySlug, workdaySlug } from "@/lib/collectors/workday-url";

export type BoardKind = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday" | "other";
const ATS_URL: { ats: Exclude<BoardKind, "workday" | "other">; re: RegExp }[] = [
  { ats: "greenhouse", re: /^https:\/\/(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_app\?for=)?([a-z0-9][a-z0-9_-]*)/i },
  { ats: "lever", re: /^https:\/\/jobs\.lever\.co\/([a-z0-9][a-z0-9_.-]*)/i },
  { ats: "ashby", re: /^https:\/\/jobs\.ashbyhq\.com\/([a-z0-9][a-z0-9_.%-]*)/i },
  { ats: "smartrecruiters", re: /^https:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9][a-z0-9_-]*)/i },
];

/** The ATS and company board name inside a job-page link, or null for any other site. */
export function parseAtsUrl(url: string): { ats: BoardKind; slug: string } | null {
  const wd = parseWorkdayUrl(url);
  if (wd) return { ats: "workday", slug: workdaySlug(wd.host, wd.site) };
  for (const { ats, re } of ATS_URL) {
    const m = url.match(re);
    if (m && !["embed", "jobs", "job", "careers"].includes(m[1].toLowerCase())) return { ats, slug: decodeURIComponent(m[1]) };
  }
  // Workable and Recruitee are stored as "other" with the system named in the slug.
  const wk = url.match(/^https:\/\/apply\.workable\.com\/(?!api\b|j\b)([a-z0-9][a-z0-9_-]*)/i);
  if (wk) return { ats: "other", slug: `workable:${wk[1]}` };
  const rc = url.match(/^https:\/\/([a-z0-9][a-z0-9-]*)\.recruitee\.com\b/i);
  if (rc && !["www", "api", "app"].includes(rc[1].toLowerCase())) return { ats: "other", slug: `recruitee:${rc[1]}` };
  return null;
}

/** A readable company name for a board: the Workday tenant, or the board name on other systems. */
export function boardName(b: { ats: BoardKind; slug: string }): string {
  if (b.ats === "other") return prettifySlug(b.slug.replace(/^[a-z]+:/, ""));
  if (b.ats === "workday") { const w = splitWorkdaySlug(b.slug); return w ? prettifySlug(w.tenant) : prettifySlug(b.slug); }
  return prettifySlug(b.slug);
}

/** "acme-corp" becomes "Acme Corp". */
export const prettifySlug = (slug: string) => slug.replace(/[-_.]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);

export interface WebResult { title: string; url: string; host: string; snippet: string }

export interface JobSearchInput { role?: string; company?: string; location?: string; level?: string; tools?: string; workType?: string; visa?: boolean }
export interface CompanySearchInput { industry?: string; location?: string; size?: string; stage?: string; hiring?: boolean }

export function webSearchConfigured(): boolean {
  return (process.env.TAVILY_API_KEY ?? "").length > 10;
}

const clean = (s: string | undefined) => (s ?? "").replace(/[^\p{L}\p{N}\s.,&+#/-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const join = (...parts: (string | undefined | false)[]) => parts.map((p) => (p ? clean(p) : "")).filter(Boolean).join(" ");

/** For searches limited to job hosts a plain query works best; extra words like "apply" only pull noise. */
export function buildJobQuery(i: JobSearchInput): string {
  const q = join(i.role || "sales development representative", i.level, i.company && `at ${i.company}`, i.location && `in ${i.location}`,
    i.workType && i.workType !== "any" && i.workType, i.tools, i.visa && "visa sponsorship");
  return q;
}

export function buildCompanyQuery(i: CompanySearchInput): string {
  return `${join(i.industry || "B2B SaaS", "companies", i.location && `in ${i.location}`, i.size, i.stage)}${i.hiring ? " hiring sales" : ""}`;
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** Strips markdown links, headings and stray symbols so a snippet reads as plain text. */
export function cleanSnippet(raw: string): string {
  return raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_`>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}

const matchesHost = (host: string, list: string[]) => list.some((b) => host === b || host.endsWith(`.${b}`));

/** Parses search results. For jobs, real job pages come first and generic careers landing pages last. */
export function parseResults(json: unknown, kind: "jobs" | "companies" = "companies"): WebResult[] {
  const rows = (json as { results?: { title?: string; url?: string; content?: string }[] } | null)?.results;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    if (typeof r?.url !== "string" || !/^https:\/\//.test(r.url)) return [];
    const host = hostOf(r.url);
    if (!host || matchesHost(host, BLOCKED_HOSTS) || matchesHost(host, NOISE_HOSTS) || seen.has(r.url)) return [];
    seen.add(r.url);
    return [{ title: (r.title ?? host).slice(0, 160), url: r.url, host, snippet: cleanSnippet(r.content ?? "") }];
  }).sort((a, b) => (kind === "jobs" ? jobScore(b) - jobScore(a) : 0));
}

const jobScore = (r: WebResult) => (JOB_HINT.test(r.url) ? 2 : 0) + (JOB_HINT.test(r.title) ? 1 : 0) - (/\/careers\/?$|\/job-categories\//i.test(r.url) ? 2 : 0);

export class WebSearchError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function searchWeb(query: string, opts: { days?: number; max?: number; kind?: "jobs" | "companies"; includeDomains?: string[] } = {}): Promise<WebResult[]> {
  const body: Record<string, unknown> = {
    query, max_results: opts.max ?? 10, search_depth: "basic", exclude_domains: BLOCKED_HOSTS,
    ...(opts.days ? { time_range: opts.days <= 7 ? "week" : "month" } : {}),
    ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
  };
  const res = await fetch(ENDPOINT, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}` },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new WebSearchError("The web search limit was reached. Try again later.", 429);
  if (res.status === 401 || res.status === 403) throw new WebSearchError("The web search key was refused. Check TAVILY_API_KEY.", 502);
  if (!res.ok) throw new WebSearchError(`Web search returned an error (${res.status}).`, 502);
  return parseResults(await res.json(), opts.kind);
}
