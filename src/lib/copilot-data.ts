import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchema } from "@/lib/migration";
import { keptWords, type Copilot, type Seniority } from "@/lib/copilots";

type CopilotRow = {
  id: string; name: string | null; titles: string[] | null; remote: boolean; remote_regions: string[] | null; onsite: boolean;
  places: string[] | null; seniority: string[] | null; exclude_words: string[] | null; is_on: boolean;
};

const COLUMNS = "id, name, titles, remote, remote_regions, onsite, places, seniority, exclude_words, is_on";

export const toCopilot = (r: CopilotRow): Copilot => ({
  id: r.id,
  name: r.name ?? "",
  titles: r.titles ?? [],
  remote: r.remote,
  remoteRegions: r.remote_regions ?? [],
  onsite: r.onsite,
  places: r.places ?? [],
  seniority: (r.seniority ?? []) as Seniority[],
  excludeWords: r.exclude_words ?? [],
  isOn: r.is_on,
});

export async function loadCopilots(db: SupabaseClient, uid: string): Promise<{ copilots: Copilot[]; needsMigration: boolean }> {
  if (!uid) return { copilots: [], needsMigration: false };
  const { data, error } = await db.from("copilots").select(COLUMNS).eq("user_id", uid).order("created_at", { ascending: true });
  if (error) return { copilots: [], needsMigration: isMissingSchema(error) };
  return { copilots: ((data ?? []) as CopilotRow[]).map(toCopilot), needsMigration: false };
}

export async function loadCopilot(db: SupabaseClient, uid: string, id: string): Promise<Copilot | null> {
  const { data } = await db.from("copilots").select(COLUMNS).eq("id", id).eq("user_id", uid).maybeSingle();
  return data ? toCopilot(data as CopilotRow) : null;
}

export interface Reactions {
  skipped: Set<string>;
  saved: Set<string>;
  kept: Set<string>;
}

/** What you did with jobs before: saved, applied (both "kept"), or skipped. Used to hide skipped jobs and rank like the kept ones. */
export async function loadReactions(db: SupabaseClient, uid: string): Promise<Reactions> {
  const out: Reactions = { skipped: new Set(), saved: new Set(), kept: new Set() };
  if (!uid) return out;
  const { data: scores } = await db.from("job_scores").select("job_id, reaction").eq("user_id", uid).in("reaction", ["bookmarked", "applied", "skipped"]).order("scored_at", { ascending: false }).limit(300);
  const keptIds: string[] = [];
  for (const s of (scores ?? []) as { job_id: string; reaction: string }[]) {
    if (s.reaction === "skipped") out.skipped.add(s.job_id);
    else {
      out.saved.add(s.job_id);
      keptIds.push(s.job_id);
    }
  }
  if (keptIds.length > 0) {
    const { data: titles } = await db.from("jobs").select("id, title").in("id", keptIds);
    for (const t of (titles ?? []) as { id: string; title: string }[]) out.kept.add(t.title);
  }
  return out;
}

export const keptWordSet = (r: Reactions) => keptWords([...r.kept]);
