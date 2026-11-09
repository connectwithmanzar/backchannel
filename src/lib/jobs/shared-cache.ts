import { unstable_cache } from "next/cache";
import { serviceClient } from "@/lib/supabase/service";

export const JOB_COLUMNS =
  "id, title, location, remote_type, market, board, url, posted_at, last_checked_at, currency, ote_min, ote_max, base_min, base_max, pay_band_status, visa_sponsorship, description, company_name, company_id, companies(name)" as const;

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
  ["shared-jobs-v1"],
  { revalidate: 300, tags: [SHARED_JOBS_TAG] }
);
