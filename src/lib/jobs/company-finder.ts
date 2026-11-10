import { parseAtsUrl, searchWeb, JOB_HOSTS, type WebResult } from "@/lib/websearch";
import type { Found } from "@/lib/jobs/discover";

/** Only ordinary public website names are ever fetched: no IP addresses, localhost or internal-looking hosts. */
export function isSafeHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return false;
  if (/^\d+(\.\d+)*$/.test(h) || h.split(".").every((p) => /^\d+$/.test(p))) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|corp|home|test|invalid|example)$/.test(h);
}

/** Pages on a company's own site where its careers link usually lives. */
export function careerPageCandidates(domain: string): string[] {
  return [`https://${domain}/careers`, `https://careers.${domain}`, `https://jobs.${domain}`, `https://${domain}/jobs`, `https://${domain}/company/careers`, `https://www.${domain}/careers`];
}

/** Company job boards and Workday links found inside a careers page's HTML. */
export function findBoardsInHtml(html: string): { boards: Found[]; workday: string | null } {
  const urls = html.match(/https?:\/\/[^\s"'<>)\\]+/gi) ?? [];
  const boards = new Map<string, Found>();
  let workday: string | null = null;
  for (const raw of urls) {
    const u = raw.replace(/^http:/, "https:").replace(/&amp;/g, "&");
    const f = parseAtsUrl(u);
    if (f && !boards.has(`${f.ats}/${f.slug.toLowerCase()}`)) boards.set(`${f.ats}/${f.slug.toLowerCase()}`, f);
    if (!workday && f?.ats === "workday") workday = u.split(/[?#]/)[0];
  }
  return { boards: [...boards.values()], workday };
}

async function fetchHtml(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" || !isSafeHost(u.hostname)) return null;
    try {
      const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "Backchannel careers check (personal use)", Accept: "text/html" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { current = new URL(res.headers.get("location")!, current).toString(); continue; }
      return res.ok ? (await res.text()).slice(0, 800_000) : null;
    } catch { return null; }
  }
  return null;
}

/** Looks at a company's own careers pages for the job system it uses. */
export async function probeCareersSite(domain: string): Promise<{ boards: Found[]; workday: string | null; page: string | null }> {
  if (!isSafeHost(domain)) return { boards: [], workday: null, page: null };
  for (const url of careerPageCandidates(domain)) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const found = findBoardsInHtml(html);
    if (found.boards.length || found.workday) return { ...found, page: url };
  }
  return { boards: [], workday: null, page: null };
}

const NOT_A_HOMEPAGE = ["linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "wikipedia.org", "crunchbase.com", "glassdoor.com", "glassdoor.co.in", "indeed.com", "zoominfo.com", "g2.com", "bloomberg.com", "reddit.com", "medium.com", "naukri.com", "ambitionbox.com", "pitchbook.com", "apollo.io", "rocketreach.co", "owler.com", "tracxn.com"];
export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The company's own website from a web search: the first result whose name looks like the company. */
export function pickHomepage(name: string, results: WebResult[]): string | null {
  const key = squash(name).slice(0, 6);
  if (key.length < 3) return null;
  for (const r of results) {
    if (NOT_A_HOMEPAGE.some((b) => r.host === b || r.host.endsWith(`.${b}`))) continue;
    const label = squash(r.host.split(".").slice(0, -1).join(""));
    if (isSafeHost(r.host) && (label.includes(key) || squash(name).includes(label.slice(0, 6)) && label.length >= 3)) return r.host;
  }
  return null;
}

export async function resolveDomain(name: string): Promise<string | null> {
  try { return pickHomepage(name, await searchWeb(`${name} official website`, { max: 8 })); } catch { return null; }
}

/**
 * True for a link to one specific posting, false for a category, search or landing page such as "Sales jobs | Sales jobs at Adobe".
 * A posting link has a job path followed by an id or title, or a long number, or a known board-job parameter.
 */
export function looksLikePosting(url: string): boolean {
  try {
    const u = new URL(url);
    if (parseAtsUrl(url) && /\/(jobs?|[0-9a-f-]{8,})\//i.test(u.pathname + "/")) return true;
    if (u.search.includes("gh_jid") || u.search.includes("jobId")) return true;
    if (/\/(job|jobs|position|positions|opening|openings|vacancy|requisition|req)\/[^/]{4,}/i.test(u.pathname)) return true;
    return /\/\d{5,}(\/|$|-)|_[A-Z]{1,3}\d{4,}/.test(u.pathname);
  } catch { return false; }
}

/** The company's job-system boards, found by searching the job systems themselves for its name (Workday, Greenhouse, Lever...). */
export async function searchCompanyBoards(name: string): Promise<{ ats: Found["ats"]; slug: string }[]> {
  const hosts = JOB_HOSTS.filter((h) => /greenhouse|lever|ashbyhq|smartrecruiters|myworkdayjobs/.test(h));
  const results = await searchWeb(`${name} sales`, { max: 20, kind: "jobs", includeDomains: hosts });
  const key = squash(name).slice(0, 6);
  const boards = new Map<string, { ats: Found["ats"]; slug: string }>();
  for (const r of results) {
    const f = parseAtsUrl(r.url);
    if (f && squash(f.slug).includes(key)) boards.set(`${f.ats}/${f.slug.toLowerCase()}`, f);
  }
  return [...boards.values()];
}

/** Last resort: search the company's own site and the main job sites, keeping only results that mention the company. */
export async function searchCompanyRoles(name: string, domain: string | null): Promise<WebResult[]> {
  const hosts = [...(domain ? [domain] : []), ...JOB_HOSTS];
  const results = await searchWeb(`${name} sales jobs careers`, { max: 15, kind: "jobs", includeDomains: hosts });
  const key = squash(name);
  return results.filter((r) => looksLikePosting(r.url) && squash(`${r.title} ${r.url} ${r.snippet}`).includes(key));
}
