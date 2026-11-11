// JobRadar is the owner's own job-search app. It runs on his Mac and reads LinkedIn, Naukri, Indeed,
// Glassdoor and Bayt (JobSpy), plus Instahyre, NaukriGulf, Foundit and GulfTalent (via Apify). Test phase only: jobs it sends are private to the owner (added_by = owner,
// source "jobradar:<site>") and are dropped before any public launch. Backchannel's servers never
// fetch those sites themselves; they only receive what the owner sends.

export const JOBRADAR_SITES = ["linkedin", "indeed", "naukri", "glassdoor", "bayt", "instahyre", "naukrigulf", "foundit", "gulftalent", "adzuna", "workingnomads", "remoteok", "weworkremotely", "himalayas", "remotive", "google"] as const;
export type JobRadarSite = (typeof JOBRADAR_SITES)[number];

export interface JobRadarListing {
  title: string;
  company: string;
  location: string;
  url: string;
  site: JobRadarSite;
  description: string;
}

export const MAX_JOBRADAR_JOBS = 100;

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Keeps rows with a title, a company and an https link; drops repeats by link. */
export function validJobRadarListings(rows: unknown): JobRadarListing[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: JobRadarListing[] = [];
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    const title = s(o.title, 200), company = s(o.company, 200), url = s(o.url, 1000);
    const site = s(o.site, 20).toLowerCase() as JobRadarSite;
    if (!title || !company || !/^https:\/\//i.test(url) || seen.has(url)) continue;
    if (!JOBRADAR_SITES.includes(site)) continue;
    seen.add(url);
    out.push({ title, company, location: s(o.location, 200) || "Not stated", url, site, description: s(o.description, 12_000) });
    if (out.length >= MAX_JOBRADAR_JOBS) break;
  }
  return out;
}

/** Company names worth looking up as Sources: unique by lower-case name, in first-seen order. */
export function uniqueCompanies(listings: Pick<JobRadarListing, "company">[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of listings) {
    const key = l.company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(l.company);
    if (out.length >= max) break;
  }
  return out;
}

export const SITE_NAMES: Record<JobRadarSite, string> = {
  linkedin: "LinkedIn", indeed: "Indeed", naukri: "Naukri", glassdoor: "Glassdoor", bayt: "Bayt",
  instahyre: "Instahyre", naukrigulf: "NaukriGulf", foundit: "Foundit", gulftalent: "GulfTalent",
  adzuna: "Adzuna", workingnomads: "Working Nomads", remoteok: "RemoteOK", weworkremotely: "We Work Remotely", himalayas: "Himalayas", remotive: "Remotive", google: "Google Jobs",
};
