// Coverage check: of the jobs you found and saved by hand, how many had Backchannel already found by itself?
// A job counts as found when another copy exists from a different source (JobRadar or a company career page),
// matched by the same link, or by the same company and title.

export interface CoverageJob { id: string; title: string; company: string; url: string; source: string | null }

export interface Coverage {
  total: number;
  found: number;
  /** Whole percent found, or null when nothing has been saved by hand yet. */
  rate: number | null;
  /** Where the found ones came from, e.g. { "JobRadar · LinkedIn": 3, "Company career page": 2 }. */
  via: Record<string, number>;
  /** The saved jobs nothing else had found, newest first. */
  missed: CoverageJob[];
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const companyKey = (s: string) => norm(s).replace(/(inc|llc|ltd|limited|pvt|private|corp|corporation|technologies|technology|labs)$/g, "");
const titleCompany = (j: { title: string; company: string }) => `${norm(j.title)}|${companyKey(j.company)}`;

/** Host and path of a link, without the query or a trailing slash, so tracking parameters do not hide a match. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return "";
  }
}

/** A plain label for where a job came from. */
export function viaLabel(source: string | null): string {
  if (source?.startsWith("jobradar:")) {
    const site = source.slice("jobradar:".length);
    return `JobRadar · ${site.charAt(0).toUpperCase()}${site.slice(1)}`;
  }
  return "Company career page";
}

export function computeCoverage(handSaved: CoverageJob[], others: CoverageJob[]): Coverage {
  const byTitleCompany = new Map<string, CoverageJob>();
  const byUrl = new Map<string, CoverageJob>();
  for (const o of others) {
    if (o.source === "pasted") continue;
    byTitleCompany.set(titleCompany(o), o);
    const k = urlKey(o.url);
    if (k) byUrl.set(k, o);
  }
  const via: Record<string, number> = {};
  const missed: CoverageJob[] = [];
  let found = 0;
  for (const h of handSaved) {
    const k = urlKey(h.url);
    const hit = (k && byUrl.get(k)) || byTitleCompany.get(titleCompany(h));
    if (hit) {
      found++;
      const label = viaLabel(hit.source);
      via[label] = (via[label] ?? 0) + 1;
    } else missed.push(h);
  }
  const total = handSaved.length;
  return { total, found, rate: total ? Math.round((found / total) * 100) : null, via, missed };
}
