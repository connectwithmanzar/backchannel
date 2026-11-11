import { unstable_cache } from "next/cache";
import { serviceClient } from "@/lib/supabase/service";

export const JOB_COLUMNS =
  "id, title, location, remote_type, market, board, url, posted_at, last_checked_at, currency, ote_min, ote_max, base_min, base_max, pay_band_status, visa_sponsorship, description, company_name, company_id, companies(name, domain)" as const;

// The cache has a size limit per entry, so the page works from the first part of each description.
// Scores saved by the daily job still use the full text.
export const CACHED_DESCRIPTION_CHARS = 3000;
export const SHARED_JOBS_TAG = "jobs";

/**
 * Active jobs collected from public company boards, shared by everyone, kept for 5 minutes.
 * Only rows nobody pasted (added_by is null) are read here, because this uses the service role,
 * which bypasses row-level security. A user's own pasted jobs are always read separately, per user.
 */
export const getSharedJobs = unstable_cache(
  async () => {
    const { data, error } = await serviceClient()
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("is_active", true)
      .is("added_by", null)
      .order("last_checked_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Loading shared jobs failed: ${error.message}`);
    return (data ?? []).map((r) => ({ ...r, description: (r.description ?? "").slice(0, CACHED_DESCRIPTION_CHARS) }));
  },
  ["shared-jobs-v2"],
  { revalidate: 300, tags: [SHARED_JOBS_TAG] }
);

type SharedJob = Awaited<ReturnType<typeof getSharedJobs>>[number];

/** Characters that would change meaning inside a search pattern are dropped from what the user typed. */
const cleanTerm = (q: string) => q.replace(/[%_\\,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * The shared list above holds only the newest 500 roles, so roles at the companies you watch, or at a company
 * you searched for, can be missing from it. This reads those on their own (at most 350 rows).
 * Same rules as above: service role, so only rows nobody pasted (added_by is null).
 */
async function loadFocusJobs(companyIds: string[], search?: string): Promise<SharedJob[]> {
  const db = serviceClient();
  const ids = new Set(companyIds);
  const term = cleanTerm(search ?? "");
  if (term.length >= 2) {
    const { data } = await db.from("companies").select("id").ilike("name", `%${term}%`).limit(25);
    for (const c of data ?? []) ids.add(c.id as string);
  }
  if (!ids.size) return [];
  const { data, error } = await db.from("jobs").select(JOB_COLUMNS).eq("is_active", true).is("added_by", null)
    .in("company_id", [...ids].slice(0, 200)).order("last_checked_at", { ascending: false }).limit(350);
  if (error) { console.error("Loading focus jobs failed:", error.message); return []; }
  return (data ?? []).map((r) => ({ ...r, description: (r.description ?? "").slice(0, CACHED_DESCRIPTION_CHARS) })) as unknown as SharedJob[];
}

/** The same, kept for 5 minutes per set of companies and search, so the page does not re-read long descriptions on every visit. */
export const getFocusJobs = unstable_cache(loadFocusJobs, ["focus-jobs-v1"], { revalidate: 300, tags: [SHARED_JOBS_TAG] });
