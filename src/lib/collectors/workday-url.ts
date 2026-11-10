// Pure helpers for Workday job boards. Safe to use in the browser: no server-only imports.
// A Workday board is stored as "host|site", for example "acme.wd5.myworkdayjobs.com|External".
export const WORKDAY_HOST = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/;
export const WORKDAY_SITE = /^[A-Za-z0-9_-]{2,60}$/;

/** The Workday host and site inside a Workday job link, or null for any other link. */
export function parseWorkdayUrl(url: string): { host: string; site: string } | null {
  const m = url.match(/^https:\/\/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Za-z]{2}\/)?([A-Za-z0-9_-]+)/);
  if (!m || ["wday", "job", "login"].includes(m[2].toLowerCase())) return null;
  return { host: m[1].toLowerCase(), site: m[2] };
}

export const workdaySlug = (host: string, site: string) => `${host}|${site}`;

export function splitWorkdaySlug(slug: string): { host: string; tenant: string; site: string } | null {
  const [host, site] = slug.split("|");
  const m = host?.match(WORKDAY_HOST);
  return m && site && WORKDAY_SITE.test(site) ? { host, tenant: m[1], site } : null;
}

/** "Posted 3 Days Ago", "Posted Today", "Posted 30+ Days Ago" become an approximate date. */
export function parsePostedOn(text: string | undefined, now = Date.now()): string | null {
  const t = (text ?? "").toLowerCase();
  if (t.includes("today")) return new Date(now).toISOString();
  if (t.includes("yesterday")) return new Date(now - 864e5).toISOString();
  const m = t.match(/(\d+)\+?\s*days?/);
  return m ? new Date(now - Number(m[1]) * 864e5).toISOString() : null;
}

export interface WorkdayPosting { title: string; path: string; location: string; posted: string | null }

export function parseWorkdayList(json: unknown, now = Date.now()): WorkdayPosting[] {
  const rows = (json as { jobPostings?: { title?: string; externalPath?: string; locationsText?: string; postedOn?: string }[] } | null)?.jobPostings;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r?.title && typeof r.externalPath === "string" && r.externalPath.startsWith("/"))
    .map((r) => ({ title: String(r.title), path: String(r.externalPath), location: String(r.locationsText ?? ""), posted: parsePostedOn(r.postedOn, now) }));
}

