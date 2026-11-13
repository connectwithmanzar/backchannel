// Who to ask for a referral, in what order, for a given company and role. Pure functions, tested without a network.
// LinkedIn cannot be read by an app, so the people come from two places: your own LinkedIn connections export (people you already know),
// and ready-made LinkedIn searches that you open yourself.
import { managerTitleFor, matchConnections, type Connection } from "@/lib/jobs/referral-paths";
import { isExcludedCompany } from "@/data/companies";

export type CompanySize = "small" | "mid" | "large";

export const SIZE_LABEL: Record<CompanySize, string> = { small: "Small (under 200 people)", mid: "Mid-size (200 to 1,000)", large: "Large (over 1,000)" };

/** A free-text size such as "51-200", "1,001-5,000 employees" or "10000+" becomes a bucket. Unknown text gives null. */
export function sizeBucket(text: string | null | undefined): CompanySize | null {
  if (!text) return null;
  const nums = (text.replace(/,/g, "").match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  const top = Math.max(...nums);
  return top <= 200 ? "small" : top <= 1000 ? "mid" : "large";
}

export interface SearchOpts { company: string; keywords: string; location?: string; degree?: "1st" | "2nd" }

export function linkedinSearchUrl({ company, keywords, location, degree }: SearchOpts): string {
  const q = [company, keywords, location].filter((x) => x && x.trim()).join(" ");
  const network = degree === "1st" ? '&network=%5B%22F%22%5D' : degree === "2nd" ? '&network=%5B%22S%22%5D' : "";
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q.trim())}${network}&origin=GLOBAL_SEARCH_HEADER`;
}

export interface FinderGroup {
  key: string;
  label: string;
  why: string;
  /** Searches to open. 1st-degree and 2nd-degree come first because someone you are connected to, or share a connection with, answers more often. */
  links: { label: string; url: string }[];
}

interface Target { key: string; label: string; why: string; keywords: string }

/** The people to look for, best first, depending on how big the company is. */
export function targetsFor(size: CompanySize, roleTitle: string): Target[] {
  const similar: Target = { key: "peers", label: `People with a similar title`, why: "Someone doing this job can speak to the team and often refers for a bonus.", keywords: roleTitle.trim() || "Account Executive" };
  const manager: Target = { key: "manager", label: "The likely hiring manager", why: "The person this role reports to decides who gets interviewed.", keywords: managerTitleFor(roleTitle) };
  const salesLeader: Target = { key: "sales-leader", label: "Sales leadership", why: "Heads of sales can pull a CV straight to the hiring manager.", keywords: "Head of Sales OR VP Sales OR Sales Director OR Chief Revenue Officer" };
  const recruiter: Target = { key: "recruiter", label: "Recruiters and talent acquisition", why: "They own the process, so a friendly note here keeps you from getting lost.", keywords: "Talent Acquisition OR Recruiter OR Technical Recruiter OR Sourcer" };
  const founders: Target = { key: "founders", label: "Founders and executives", why: "In a small company the leaders hire, and they read their own messages.", keywords: "Founder OR Co-founder OR CEO OR COO OR CRO OR Managing Director" };
  const people: Target = { key: "people", label: "Head of people or talent", why: "Small teams often have one person handling hiring.", keywords: "Head of People OR HR Manager OR Talent Partner OR Office Manager" };
  if (size === "small") return [founders, salesLeader, manager, people, recruiter];
  if (size === "mid") return [manager, salesLeader, similar, recruiter, founders];
  return [similar, manager, salesLeader, recruiter];
}

export interface FinderResult {
  company: string;
  size: CompanySize;
  /** People you are already connected to at this company, best first. */
  mutuals: Connection[];
  groups: FinderGroup[];
}

export function findReferralPaths(input: { company: string; roleTitle: string; size: CompanySize; location?: string; connections: Connection[] }): FinderResult {
  const company = input.company.trim();
  if (!company || isExcludedCompany(company)) return { company, size: input.size, mutuals: [], groups: [] };
  const groups = targetsFor(input.size, input.roleTitle).map((t): FinderGroup => ({
    key: t.key, label: t.label, why: t.why,
    links: [
      { label: "People you're connected to", url: linkedinSearchUrl({ company, keywords: t.keywords, degree: "1st" }) },
      { label: "Friends of friends", url: linkedinSearchUrl({ company, keywords: t.keywords, degree: "2nd" }) },
      { label: input.location?.trim() ? `Anyone in ${input.location.trim()}` : "Anyone", url: linkedinSearchUrl({ company, keywords: t.keywords, location: input.location }) },
    ],
  }));
  return { company, size: input.size, mutuals: matchConnections(input.connections, company, 10), groups };
}
