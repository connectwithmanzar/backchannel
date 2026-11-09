import { NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// TEMPORARY timing probe. Signed-in users only, returns timings and no data. Delete after use.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = await createClient();
  const svc = serviceClient();
  const out: Record<string, number> = {};
  const time = async (label: string, fn: () => PromiseLike<unknown>) => {
    const s = performance.now();
    await fn();
    out[label] = Math.round(performance.now() - s);
  };

  await time("svc_head_1", () => svc.from("profiles").select("user_id", { count: "exact", head: true }));
  await time("svc_head_2", () => svc.from("profiles").select("user_id", { count: "exact", head: true }));
  await time("user_head_1", () => sb.from("profiles").select("user_id", { count: "exact", head: true }));
  await time("user_head_2", () => sb.from("profiles").select("user_id", { count: "exact", head: true }));
  await time("user_scores_limit1", () => sb.from("job_scores").select("job_id").eq("user_id", user.id).limit(1));
  await time("user_scores_all", () => sb.from("job_scores").select("job_id, score, parts, explanation, model, reaction").eq("user_id", user.id));
  await time("raw_rest_anon", () => fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=1`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }));
  await time("raw_rest_anon_2", () => fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=1`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }));
  await time("user_parallel_3", () => Promise.all([
    sb.from("profiles").select("name").maybeSingle(),
    sb.from("job_scores").select("job_id").eq("user_id", user.id).limit(1),
    sb.from("jobs").select("id").eq("is_active", true).not("added_by", "is", null),
  ]));
  return NextResponse.json(out);
}
