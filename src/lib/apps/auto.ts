import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareApplication } from "./prepare";

/** For users with Autopilot on: prepares applications for today's best new matches (never submits). */
export async function autoPrepare(svc: SupabaseClient, userId: string, deadline: number) {
  const { data: prefs } = await svc.from("preferences").select("autopilot_mode, autopilot_min_fit, autopilot_daily_cap").eq("user_id", userId).maybeSingle();
  if (prefs?.autopilot_mode !== "auto") return { prepared: 0, reason: "Autopilot is off" };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await svc.from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  const room = (prefs.autopilot_daily_cap ?? 5) - (count ?? 0);
  if (room <= 0) return { prepared: 0, reason: "Daily cap reached" };

  const [{ data: scores }, { data: apps }] = await Promise.all([
    svc.from("job_scores").select("job_id, score, reaction, jobs!inner(is_active)").eq("user_id", userId)
      .gte("score", prefs.autopilot_min_fit ?? 75).eq("jobs.is_active", true).order("score", { ascending: false }).limit(100),
    svc.from("applications").select("job_id").eq("user_id", userId),
  ]);
  const done = new Set((apps ?? []).map((a: { job_id: string }) => a.job_id));
  const picks = (scores ?? []).filter((s: { job_id: string; reaction: string | null }) => s.reaction !== "skipped" && !done.has(s.job_id)).slice(0, room);
  let prepared = 0;
  for (const p of picks) {
    if (Date.now() > deadline) break;
    try { await prepareApplication(svc, userId, p.job_id); prepared++; } catch { /* keep going */ }
  }
  return { prepared };
}
