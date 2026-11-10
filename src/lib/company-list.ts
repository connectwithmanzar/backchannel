import { countryOf } from "@/lib/role-filters";

export type CompanyStatus = "interested" | "applied" | "not_for_me" | null;
export type CompanyFilter = "all" | "india" | "interested" | "applied" | "attention";

export interface CompanyRow {
  id: string; name: string; domain: string | null; atsType: string | null; hasBoard: boolean; enabled: boolean;
  error: string | null; lastCheckedAt: string | null;
  roles: number; inIndia: number; newThisWeek: number;
  status: CompanyStatus; note: string; watching: boolean;
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
      case "attention": return needsAttention(c);
      default: return c.status !== "not_for_me" || q !== "";
    }
  });
}

export function filterCounts(rows: CompanyRow[]): Record<CompanyFilter, number> {
  return {
    all: rows.filter((c) => c.status !== "not_for_me").length,
    india: rows.filter((c) => c.inIndia > 0).length,
    interested: rows.filter((c) => c.status === "interested").length,
    applied: rows.filter((c) => c.status === "applied").length,
    attention: rows.filter(needsAttention).length,
  };
}
