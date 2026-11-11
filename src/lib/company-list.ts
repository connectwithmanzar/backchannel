import { countryOf } from "@/lib/role-filters";
import { tierRank as rankTier, type Tier } from "@/lib/company-rating";
import type { Research } from "@/lib/company-research";

export type CompanyStatus = "interested" | "applied" | "not_for_me" | null;
export type CompanyFilter = "all" | "india" | "hiring" | "gulf" | "interested" | "applied" | "attention";
const GULF = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman"];

export interface CompanyRow {
  id: string; name: string; domain: string | null; atsType: string | null; hasBoard: boolean; enabled: boolean;
  error: string | null; lastCheckedAt: string | null;
  roles: number; inIndia: number; newThisWeek: number;
  country: string | null; size: string | null; sector: string | null; linkedinUrl: string | null; companyType: string | null;
  hiring: "yes" | "unclear" | "no" | null; linkedinOpenings: number | null;
  status: CompanyStatus; note: string; watching: boolean;
  /** Your target-list tier (migration 0017). Missing or null means you only watch it. */
  tier?: CompanyTier;
  /** What you know about the company (migration 0018). */
  research?: Research | null;
}

export type CompanyTier = Tier | null;
export type TierFilter = "any" | Tier;

/** A sorts first, then B, C, no tier, and D last. */
export const tierRank = rankTier;

export function filterByTier(rows: CompanyRow[], tier: TierFilter): CompanyRow[] {
  return tier === "any" ? rows : rows.filter((c) => c.tier === tier);
}

export interface Suggestion { id: string; name: string; reason: string }

/** Companies you do not watch yet that opened the most new sales roles this week: worth a look for your list. */
export function suggestCompanies(rows: CompanyRow[], max = 3): Suggestion[] {
  return rows
    .filter((c) => !c.watching && !c.tier && c.status !== "not_for_me" && c.newThisWeek > 0)
    .sort((a, b) => b.newThisWeek - a.newThisWeek || b.inIndia - a.inIndia || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((c) => ({
      id: c.id,
      name: c.name,
      reason: `${c.newThisWeek} new sales ${c.newThisWeek === 1 ? "role" : "roles"} this week${c.inIndia ? `, ${c.inIndia} in India` : ""}.`,
    }));
}

export interface JobStub { company_id: string | null; location: string | null; created_at: string }

/** Roles per company, how many are in India, and how many were first seen in the last 7 days. */
export function roleCounts(jobs: JobStub[], now = Date.now()): Map<string, { roles: number; inIndia: number; newThisWeek: number }> {
  const out = new Map<string, { roles: number; inIndia: number; newThisWeek: number }>();
  for (const j of jobs) {
    if (!j.company_id) continue;
    const c = out.get(j.company_id) ?? { roles: 0, inIndia: 0, newThisWeek: 0 };
    c.roles++;
    if (countryOf(j.location ?? "") === "India") c.inIndia++;
    if (now - Date.parse(j.created_at) <= 7 * 864e5) c.newThisWeek++;
    out.set(j.company_id, c);
  }
  return out;
}

/** A company needs attention when its board cannot be read, it has none, or its last check failed. */
export const needsAttention = (c: CompanyRow) => c.enabled && (!c.hasBoard || !!c.error);

export function filterCompanies(rows: CompanyRow[], filter: CompanyFilter, query = ""): CompanyRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q) && !(c.domain ?? "").toLowerCase().includes(q)) return false;
    switch (filter) {
      case "india": return c.inIndia > 0;
      case "interested": return c.status === "interested";
      case "applied": return c.status === "applied";
      case "hiring": return c.hiring === "yes";
      case "gulf": return c.country !== null && GULF.includes(c.country);
      case "attention": return needsAttention(c);
      default: return c.status !== "not_for_me" || q !== "";
    }
  });
}

export function filterCounts(rows: CompanyRow[]): Record<CompanyFilter, number> {
  return {
    all: rows.filter((c) => c.status !== "not_for_me").length,
    india: rows.filter((c) => c.inIndia > 0).length,
    hiring: rows.filter((c) => c.hiring === "yes").length,
    gulf: rows.filter((c) => c.country !== null && GULF.includes(c.country)).length,
    interested: rows.filter((c) => c.status === "interested").length,
    applied: rows.filter((c) => c.status === "applied").length,
    attention: rows.filter(needsAttention).length,
  };
}
