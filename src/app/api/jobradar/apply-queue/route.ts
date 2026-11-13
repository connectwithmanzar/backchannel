import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner, missingTable } from "@/lib/jobradar-auth";
import { buildFormProfile, clampAutoCap, cleanAutoMode, isStale, missingProfileDetails, remainingToday } from "@/lib/auto-apply";
import type { AppQuestion } from "@/lib/apps/prepare";

export const runtime = "nodejs";
export const maxDuration = 30;

const MIGRATION = "Auto-apply needs one database update first. Run supabase/migrations/0020_auto_apply.sql in Supabase (SQL Editor, paste, Run).";
const BATCH = 25;

type Row = {
  id: string; job_id: string; auto_status: string; auto_at: string | null; tailored_cv: string | null; cover_note: string | null; questions: AppQuestion[] | null;
  jobs: { title: string; url: string | null; company_name: string | null; companies: { name: string } | null } | null;
};

// GET /api/jobradar/apply-queue: the applications you queued for auto-apply, with everything the robot browser needs.
// Owner only (JOBRADAR_SECRET). Handed-out items are marked "running" so two runs never apply twice.
export async function GET(req: NextRequest) {
  const auth = await jobradarOwner(req, 600);
  if (auth instanceof NextResponse) return auth;
  const { svc, ownerId } = auth;

  const { data: prefs, error: prefsError } = await svc.from("preferences").select("auto_apply_mode, auto_apply_daily_cap, standard_answers").eq("user_id", ownerId).maybeSingle();
  if (prefsError) return NextResponse.json({ error: missingTable(prefsError) ? MIGRATION : "Couldn't read your settings." }, { status: missingTable(prefsError) ? 503 : 500 });

  const mode = cleanAutoMode(prefs?.auto_apply_mode);
  const cap = clampAutoCap(prefs?.auto_apply_daily_cap);
  const saved = (prefs?.standard_answers ?? {}) as Record<string, string>;

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [{ data: profile }, { data: userData }, { count: doneToday }, { data: queued }] = await Promise.all([
    svc.from("profiles").select("name, cv_text").eq("user_id", ownerId).maybeSingle(),
    svc.auth.admin.getUserById(ownerId),
    svc.from("applications").select("id", { count: "exact", head: true }).eq("user_id", ownerId).eq("auto_status", "submitted").gte("auto_at", dayStart.toISOString()),
    svc.from("applications").select("id, job_id, auto_status, auto_at, tailored_cv, cover_note, questions, jobs(title, url, company_name, companies(name))")
      .eq("user_id", ownerId).in("auto_status", ["queued", "running"]).order("auto_at", { ascending: true, nullsFirst: true }).limit(200),
  ]);

  const formProfile = buildFormProfile(profile, userData?.user?.email ?? "", saved);
  const remaining = remainingToday(cap, doneToday ?? 0);
  const base = { mode, remaining_today: remaining, profile: formProfile, items: [] as unknown[] };

  if (mode === "off") return NextResponse.json({ ...base, note: "Auto-apply is switched off in Backchannel." });
  const missing = missingProfileDetails(formProfile);
  if (missing.length > 0) return NextResponse.json({ ...base, note: `Add these in Backchannel first: ${missing.join(", ")}.` });
  if (remaining === 0) return NextResponse.json({ ...base, note: "Today's limit is reached." });

  const ready = ((queued ?? []) as unknown as Row[])
    .filter((r) => r.jobs?.url && (r.auto_status === "queued" || isStale(r.auto_at)))
    .slice(0, Math.min(remaining, BATCH));

  if (ready.length > 0) {
    await svc.from("applications").update({ auto_status: "running", auto_at: new Date().toISOString() }).in("id", ready.map((r) => r.id)).eq("user_id", ownerId);
  }

  const items = ready.map((r) => ({
    id: r.id, job_id: r.job_id, url: r.jobs?.url ?? "", title: r.jobs?.title ?? "",
    company: r.jobs?.companies?.name ?? r.jobs?.company_name ?? "",
    cover_note: r.cover_note ?? "", tailored_cv: r.tailored_cv ?? "", questions: r.questions ?? [],
  }));
  return NextResponse.json({ ...base, items });
}
