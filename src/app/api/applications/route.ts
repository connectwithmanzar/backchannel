import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prepareApplication, type AppQuestion } from "@/lib/apps/prepare";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { checkQueueable, clampAutoCap, cleanAutoMode, buildFormProfile, type AutoMode } from "@/lib/auto-apply";
import { executeAutoApply, identifyAts } from "@/lib/auto-apply/ats-submitter";
import { loadCandidatePersona, generateHumanAtsAnswer } from "@/lib/auto-apply/ats-answerer";

const AUTO_MIGRATION = "Auto-apply needs one database update first. Run supabase/migrations/0020_auto_apply.sql in Supabase (SQL Editor, paste, Run), then try again.";
const isMissingColumn = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /does not exist|could not find/i.test(e.message ?? ""));

async function autoPrefs(db: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await db.from("preferences").select("auto_apply_mode, auto_apply_use_saved, standard_answers").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(isMissingColumn(error) ? AUTO_MIGRATION : "Couldn't read your settings.");
  return { mode: cleanAutoMode(data?.auto_apply_mode) as AutoMode, useSaved: data?.auto_apply_use_saved === true, saved: (data?.standard_answers ?? {}) as Record<string, string> };
}

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
        if (!(await rateLimitShared(`prep:${user.id}`, 30, 60 * 60 * 1000))) {
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
      case "regenerate_answer": {
        const { data: app } = await db.from("applications").select("id, questions, jobs(title, company_name, description)").eq("id", b.id).eq("user_id", user.id).single();
        if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
        const idx = Number(b.index);
        const questions = (app.questions as AppQuestion[]) || [];
        if (idx < 0 || idx >= questions.length) return NextResponse.json({ error: "Invalid question index." }, { status: 400 });

        const targetQ = questions[idx];
        const persona = await loadCandidatePersona(db, user.id);
        const job = app.jobs as unknown as { title?: string; company_name?: string; description?: string } | null;
        const jobContext = {
          title: job?.title || "Role",
          company: job?.company_name || "Company",
          description: job?.description || "",
        };

        const result = await generateHumanAtsAnswer(targetQ.q, persona, jobContext);
        if (result.answer) {
          questions[idx] = { ...targetQ, answer: result.answer };
          await db.from("applications").update({ questions, updated_at: now }).eq("id", b.id);
          return NextResponse.json({ ok: true, answer: result.answer, story_used: result.storyUsed });
        }
        return NextResponse.json({ ok: false, error: result.reason || "Could not generate answer." }, { status: 422 });
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
      case "direct_auto_apply": {
        const [{ data: app }, { data: profile }, { data: prefs }] = await Promise.all([
          db.from("applications").select("id, status, tailored_cv, cover_note, questions, job_id, jobs(title, url, company_name, companies(name))").eq("id", b.id).eq("user_id", user.id).single(),
          db.from("profiles").select("name, cv_text").eq("user_id", user.id).maybeSingle(),
          db.from("preferences").select("standard_answers").eq("user_id", user.id).maybeSingle(),
        ]);
        if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
        const job = app.jobs as unknown as { title?: string; url?: string; company_name?: string; companies?: { name?: string } } | null;
        if (!job?.url) return NextResponse.json({ error: "Job has no application link." }, { status: 400 });

        const saved = (prefs?.standard_answers ?? {}) as Record<string, string>;
        const formProfile = buildFormProfile(profile, user.email ?? "", saved);
        const cvText = app.tailored_cv?.trim() || profile?.cv_text?.trim() || "";

        const result = await executeAutoApply(job.url, {
          profile: formProfile,
          coverNote: app.cover_note ?? undefined,
          tailoredCvText: cvText,
          customQuestions: (app.questions as AppQuestion[]) || [],
        });

        if (result.ok) {
          await db.from("applications").update({
            status: "submitted",
            stage: "applied",
            submitted_at: now,
            receipt: result.receipt ?? "Direct ATS API",
            auto_status: "submitted",
            auto_log: result.receipt ?? null,
            updated_at: now,
          }).eq("id", b.id);

          await Promise.all([
            db.from("funnel_events").insert({ user_id: user.id, type: "applied", ref_id: b.id }),
            db.from("job_scores").upsert({ user_id: user.id, job_id: app.job_id, reaction: "applied" }, { onConflict: "user_id,job_id" }),
          ]);

          return NextResponse.json({ ok: true, method: result.method, receipt: result.receipt });
        }

        return NextResponse.json({
          ok: false,
          method: result.method,
          directSubmitSupported: result.directSubmitSupported,
          error: result.error || "ATS submission requires browser.",
        }, { status: 422 });
      }
      case "queue_auto": {
        const prefs = await autoPrefs(db, user.id);
        const { data: app } = await db.from("applications").select("id, status, questions").eq("id", b.id).eq("user_id", user.id).single();
        if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
        const check = checkQueueable({ status: app.status, questions: app.questions as AppQuestion[] | null }, prefs.mode, prefs.useSaved, prefs.saved);
        if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
        const { error } = await db.from("applications").update({ questions: check.questions, auto_status: "queued", auto_log: null, auto_at: now, updated_at: now }).eq("id", b.id).eq("user_id", user.id);
        if (error) throw new Error(isMissingColumn(error) ? AUTO_MIGRATION : error.message);
        return NextResponse.json({ ok: true });
      }
      case "queue_all": {
        const prefs = await autoPrefs(db, user.id);
        if (prefs.mode === "off") return NextResponse.json({ error: "Auto-apply is switched off. Turn it on in Settings first." }, { status: 400 });
        const { data: apps, error: listError } = await db.from("applications").select("id, status, questions, auto_status").eq("user_id", user.id).in("status", ["needs_answer", "awaiting_approval"]).limit(500);
        if (listError) throw new Error(isMissingColumn(listError) ? AUTO_MIGRATION : listError.message);
        let queued = 0, blocked = 0;
        for (const a of apps ?? []) {
          if (a.auto_status === "queued" || a.auto_status === "running") continue;
          const check = checkQueueable({ status: a.status, questions: a.questions as AppQuestion[] | null }, prefs.mode, prefs.useSaved, prefs.saved);
          if (!check.ok) { blocked++; continue; }
          const { error } = await db.from("applications").update({ questions: check.questions, auto_status: "queued", auto_log: null, auto_at: now, updated_at: now }).eq("id", a.id).eq("user_id", user.id);
          if (error) throw new Error(error.message);
          queued++;
        }
        return NextResponse.json({ ok: true, queued, blocked });
      }
      case "batch_auto_apply": {
        const [{ data: apps }, { data: profile }, { data: prefs }] = await Promise.all([
          db.from("applications").select("id, status, tailored_cv, cover_note, questions, job_id, jobs(title, url, company_name, companies(name))")
            .eq("user_id", user.id).in("status", ["needs_answer", "awaiting_approval"]).limit(20),
          db.from("profiles").select("name, cv_text").eq("user_id", user.id).maybeSingle(),
          db.from("preferences").select("standard_answers").eq("user_id", user.id).maybeSingle(),
        ]);

        const saved = (prefs?.standard_answers ?? {}) as Record<string, string>;
        const formProfile = buildFormProfile(profile, user.email ?? "", saved);
        let submitted = 0;
        let queuedBrowser = 0;
        const details: { company: string; status: string; receipt?: string; error?: string }[] = [];

        for (const app of apps ?? []) {
          const job = app.jobs as unknown as { title?: string; url?: string; company_name?: string; companies?: { name?: string } } | null;
          const company = job?.companies?.name || job?.company_name || "Company";
          if (!job?.url) continue;

          const ats = identifyAts(job.url);
          const cvText = app.tailored_cv?.trim() || profile?.cv_text?.trim() || "";

          // Check if sensitive questions are answered or can be filled from saved
          const rawQuestions = (app.questions as AppQuestion[]) || [];
          const missingSensitive = rawQuestions.filter((q) => q.sensitive && !q.answer.trim() && (!q.key || !saved[q.key]));
          if (missingSensitive.length > 0) {
            details.push({ company, status: "needs_answer", error: "Missing sensitive answers" });
            continue;
          }

          const resolvedQuestions = rawQuestions.map((q) => {
            if (q.sensitive && !q.answer.trim() && q.key && saved[q.key]) {
              return { ...q, answer: saved[q.key] };
            }
            return q;
          });

          if (ats.provider === "greenhouse" || ats.provider === "lever") {
            const res = await executeAutoApply(job.url, {
              profile: formProfile,
              coverNote: app.cover_note ?? undefined,
              tailoredCvText: cvText,
              customQuestions: resolvedQuestions,
            });

            if (res.ok) {
              submitted++;
              await db.from("applications").update({
                status: "submitted",
                stage: "applied",
                submitted_at: now,
                receipt: res.receipt ?? "Direct ATS API",
                auto_status: "submitted",
                auto_log: res.receipt ?? null,
                questions: resolvedQuestions,
                updated_at: now,
              }).eq("id", app.id);

              await Promise.all([
                db.from("funnel_events").insert({ user_id: user.id, type: "applied", ref_id: app.id }),
                db.from("job_scores").upsert({ user_id: user.id, job_id: app.job_id, reaction: "applied" }, { onConflict: "user_id,job_id" }),
              ]);
              details.push({ company, status: "submitted", receipt: res.receipt });
            } else {
              details.push({ company, status: "failed", error: res.error });
            }
          } else {
            // Portals like Ashby / Workday get queued for browser extension
            await db.from("applications").update({
              auto_status: "queued",
              questions: resolvedQuestions,
              updated_at: now,
            }).eq("id", app.id);
            queuedBrowser++;
            details.push({ company, status: "queued_for_extension", error: `${ats.provider.toUpperCase()} queued for 1-click browser extension.` });
          }
        }

        return NextResponse.json({ ok: true, submitted, queuedBrowser, details });
      }
      case "unqueue_auto": {
        const { error } = await db.from("applications").update({ auto_status: null, updated_at: now }).eq("id", b.id).eq("user_id", user.id).in("auto_status", ["queued", "needs_you", "failed", "filled"]);
        if (error) throw new Error(isMissingColumn(error) ? AUTO_MIGRATION : error.message);
        return NextResponse.json({ ok: true });
      }
      case "settings": {
        const patch: Record<string, unknown> = { user_id: user.id };
        if (["ask", "auto"].includes(b.autopilot_mode)) patch.autopilot_mode = b.autopilot_mode;
        if (Number.isFinite(b.autopilot_min_fit)) patch.autopilot_min_fit = Math.max(40, Math.min(95, Number(b.autopilot_min_fit)));
        if (Number.isFinite(b.autopilot_daily_cap)) patch.autopilot_daily_cap = Math.max(1, Math.min(15, Number(b.autopilot_daily_cap)));
        if (b.standard_answers && typeof b.standard_answers === "object") patch.standard_answers = b.standard_answers;
        if (b.auto_apply_mode !== undefined) patch.auto_apply_mode = cleanAutoMode(b.auto_apply_mode);
        if (b.auto_apply_daily_cap !== undefined) patch.auto_apply_daily_cap = clampAutoCap(b.auto_apply_daily_cap);
        if (typeof b.auto_apply_use_saved === "boolean") patch.auto_apply_use_saved = b.auto_apply_use_saved;
        const { error } = await db.from("preferences").upsert(patch, { onConflict: "user_id" });
        if (error) throw new Error(isMissingColumn(error) && Object.keys(patch).some((k) => k.startsWith("auto_apply")) ? AUTO_MIGRATION : error.message);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "Something went wrong." }, { status: 500 });
  }
}
