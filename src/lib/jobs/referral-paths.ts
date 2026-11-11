// Who-to-ask helpers for the referral engine: match your LinkedIn connections to a company, and build
// one-click LinkedIn search links (you open them yourself; nothing is automated on LinkedIn).
import { roleFamily } from "@/lib/jobs/process";
import { isExcludedCompany } from "@/data/companies";

const SUFFIX = /\b(inc|llc|ltd|limited|pvt|private|plc|gmbh|corp|corporation|co|company|technologies|technology|tech|labs|group|holdings|india|fz ?llc|fze|me|mena)\b/g;

/** "Careem Networks FZ-LLC" -> "careem networks". Used to match a connection's company to a job's company. */
export function companyKey(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}

export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = companyKey(a), kb = companyKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // "hubspot" vs "hubspot india operations": one key starting the other, at a word boundary, min 4 letters.
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return short.length >= 4 && (long.startsWith(short + " ") || long === short);
}

export interface Connection { full_name: string; company: string | null; position: string | null; linkedin_url: string | null; connected_on: string | null }

const SALES = /\b(sales|business development|bdr|sdr|account (executive|manager)|revenue|gtm|go[- ]to[- ]market|partnerships?|growth)\b/i;
const SENIOR = /\b(head|director|vp|vice president|chief|cro|founder|co-founder|manager|lead|principal)\b/i;
const HR = /\b(recruit|talent|people|hr|human resources)\b/i;

/** Higher = better person to ask: sales people first, then seniority, then talent team, then how recently connected. */
export function connectionRank(c: Connection, now = Date.now()): number {
  const p = c.position ?? "";
  let s = 0;
  if (SALES.test(p)) s += 40;
  if (SENIOR.test(p)) s += 25;
  if (HR.test(p)) s += 15;
  if (c.connected_on) {
    const years = (now - Date.parse(c.connected_on)) / (365 * 864e5);
    if (Number.isFinite(years)) s += Math.max(0, 20 - Math.round(years * 4));
  }
  return s;
}

/** Your connections at this company, best first. People at excluded companies (your employer) never appear. */
export function matchConnections(all: Connection[], company: string, max = 8): Connection[] {
  if (isExcludedCompany(company)) return [];
  return all
    .filter((c) => sameCompany(c.company, company) && !isExcludedCompany(c.company))
    .sort((a, b) => connectionRank(b) - connectionRank(a))
    .slice(0, max);
}

/** The title a role most likely reports to. */
export function managerTitleFor(title: string): string {
  switch (roleFamily(title)) {
    case "SDR/BDR": return "Sales Development Manager OR Head of Sales Development";
    case "Account Executive": return "Head of Sales OR Sales Director";
    case "GTM Engineer": return "Head of Revenue Operations OR Head of Growth";
    case "Account management": return "Head of Account Management OR Head of Customer Success";
    case "Partnerships": return "Head of Partnerships";
    case "Sales ops & CS": return "Head of Revenue Operations";
    case "Sales leadership": return "VP Sales OR Chief Revenue Officer";
    default: return "Head of Sales";
  }
}

export function linkedinPeopleSearch(keywords: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords.trim())}`;
}

export interface SearchLink { label: string; url: string }

/** One-click LinkedIn searches: likely hiring manager, ex-colleagues from each past employer, college alumni. */
export function referralSearchLinks(company: string, roleTitle: string, pastEmployers: string[], college: string | null): SearchLink[] {
  if (isExcludedCompany(company)) return [];
  const links: SearchLink[] = [{ label: `Likely hiring manager at ${company}`, url: linkedinPeopleSearch(`${company} ${managerTitleFor(roleTitle)}`) }];
  for (const p of pastEmployers.map((x) => x.trim()).filter(Boolean).slice(0, 5)) {
    if (sameCompany(p, company)) continue;
    links.push({ label: `People at ${company} who worked at ${p}`, url: linkedinPeopleSearch(`${company} ${p}`) });
  }
  if (college?.trim()) links.push({ label: `${college.trim()} alumni at ${company}`, url: linkedinPeopleSearch(`${company} ${college.trim()}`) });
  return links;
}
