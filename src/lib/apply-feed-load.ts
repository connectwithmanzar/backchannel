import type { SupabaseClient } from "@supabase/supabase-js";
import { toFeed, type FeedItem, type FeedRow } from "@/lib/apply-feed";
import { formatCompanyName } from "@/lib/company-name";

type Raw = { id: string; status: string | null; stage: string | null; auto_status?: string | null; auto_log?: string | null; auto_at?: string | null; updated_at: string | null; jobs: { title: string; company_name: string | null; companies: { name: string } | null } | null };

/** The latest applications as feed entries. Reads without the robot columns when migration 0020 has not been run. */
export async function loadFeed(db: SupabaseClient, userId: string): Promise<FeedItem[]> {
  const sel = "jobs(title, company_name, companies(name))";
  const full = await db.from("applications").select(`id, status, stage, auto_status, auto_log, auto_at, updated_at, ${sel}`).eq("user_id", userId).order("updated_at", { ascending: false }).limit(40);
  const rows = (full.error
    ? (await db.from("applications").select(`id, status, stage, updated_at, ${sel}`).eq("user_id", userId).order("updated_at", { ascending: false }).limit(40)).data
    : full.data) as unknown as Raw[] | null;
  const feed: FeedRow[] = (rows ?? []).map((r) => ({
    id: r.id, status: r.status, stage: r.stage, auto_status: r.auto_status ?? null, auto_log: r.auto_log ?? null, auto_at: r.auto_at ?? null, updated_at: r.updated_at,
    title: r.jobs?.title ?? "Role removed", company: formatCompanyName(r.jobs?.companies?.name ?? r.jobs?.company_name ?? "") || "Unknown company",
  }));
  return toFeed(feed);
}
