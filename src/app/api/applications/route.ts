import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prepareApplication, type AppQuestion } from "@/lib/apps/prepare";
import { rateLimit, retryAfter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const STAGES = ["applied", "screening", "interview", "final", "offer", "rejected", "withdrawn"];

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  try {
    switch (b.action) {
      case "prepare": {
        if (!rateLimit(`prep:${user.id}`, 30, 60 * 60 * 1000)) {
          return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`prep:${user.id}`)}s.` }, { status: 429 });
        }
        const r = await prepareApplication(db, user.id, String(b.job_id));
        return NextResponse.json({ ok: true, ...r });
      }
      case "answer": {
        const { data: app } = await db.from("applications").select("questions").eq("id", b.id).single();
        if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
        const questions = (app.questions as AppQuestion[]).map((q, i) => (b.answers?.[i] !== undefined ? { ...q, answer: String(b.answers[i]) } : q));
        const missing = questions.some((q) => q.sensitive && !q.answer.trim());
        const { error } = await db.from("applications").update({
          questions, status: missing ? "needs_answer" : "awaiting_approval",
          pending_question: missing ? questions.find((q) => q.sensitive && !q.answer.trim())?.q ?? null : null, updated_at: now,
        }).eq("id", b.id);
        if (error) throw error;
        if (b.save_defaults) {
          const { data: p } = await db.from("preferences").select("standard_answers").eq("user_id", user.id).maybeSingle();
          const saved = { ...((p?.standard_answers as Record<string, string>) ?? {}) };
          for (const q of questions) if (q.key && q.answer.trim()) saved[q.key] = q.answer.trim();
          await db.from("preferences").upsert({ user_id: user.id, standard_answers: saved }, { onConflict: "user_id" });
        }
        return NextResponse.json({ ok: true, status: missing ? "needs_answer" : "awaiting_approval" });
      }
      case "edit": {
        const patch: Record<string, unknown> = { updated_at: now };
        if (typeof b.tailored_cv === "string") patch.tailored_cv = b.tailored_cv;
        if (typeof b.cover_note === "string") patch.cover_note = b.cover_note;
        if (typeof b.notes === "string") patch.notes = b.notes;
        const { error } = await db.from("applications").update(patch).eq("id", b.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "submitted": {
        const { data: app, error } = await db.from("applications").update({
          status: "submitted", stage: "applied", submitted_at: now, receipt: b.receipt ? String(b.receipt) : null, updated_at: now,
        }).eq("id", b.id).select("job_id").single();
        if (error) throw error;
        await Promise.all([
          db.from("funnel_events").insert({ user_id: user.id, type: "applied", ref_id: b.id }),
          db.from("job_scores").upsert({ user_id: user.id, job_id: app.job_id, reaction: "applied" }, { onConflict: "user_id,job_id" }),
        ]);
        return NextResponse.json({ ok: true });
      }
      case "stage": {
        if (!STAGES.includes(b.stage)) return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
        const { error } = await db.from("applications").update({ stage: b.stage, updated_at: now }).eq("id", b.id);
        if (error) throw error;
        if (b.stage === "interview" || b.stage === "offer") await db.from("funnel_events").insert({ user_id: user.id, type: b.stage, ref_id: b.id });
        return NextResponse.json({ ok: true });
      }
      case "skip": {
        const { error } = await db.from("applications").update({ status: "skipped", updated_at: now }).eq("id", b.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "settings": {
        const patch: Record<string, unknown> = { user_id: user.id };
        if (["ask", "auto"].includes(b.autopilot_mode)) patch.autopilot_mode = b.autopilot_mode;
        if (Number.isFinite(b.autopilot_min_fit)) patch.autopilot_min_fit = Math.max(40, Math.min(95, Number(b.autopilot_min_fit)));
        if (Number.isFinite(b.autopilot_daily_cap)) patch.autopilot_daily_cap = Math.max(1, Math.min(15, Number(b.autopilot_daily_cap)));
        if (b.standard_answers && typeof b.standard_answers === "object") patch.standard_answers = b.standard_answers;
        const { error } = await db.from("preferences").upsert(patch, { onConflict: "user_id" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "Something went wrong." }, { status: 500 });
  }
}
