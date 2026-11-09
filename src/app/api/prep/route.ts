import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiText, hasAIKey, NO_AI_MESSAGE } from "@/lib/ai";
import { htmlToText } from "@/lib/collector/fetchers";
import { rateLimit, retryAfter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You prepare a B2B sales candidate for an interview. Absolute rules:
- Use ONLY facts in the candidate's CV and scorecard. Never invent employers, numbers, tools, results or experience.
- Where the job asks for something the candidate's facts don't show, list it under "Gaps to be ready for" with an honest way to address it. Never suggest claiming it.
- Plain text, no markdown symbols other than "- " bullets, no em-dashes.
Write these sections, each starting with its title on its own line:
Likely questions (6, specific to this role)
Your real talking points (from the CV only)
Numbers you can quote (from the scorecard only, or say none are on file)
Questions to ask them (5)
Gaps to be ready for`;

// POST /api/prep { job_id, refresh? }: interview prep for one role, saved per user.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const jobId = String(b.job_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: "Missing job." }, { status: 400 });

  if (!b.refresh) {
    const { data: saved } = await db.from("interview_preps").select("content").eq("user_id", user.id).eq("job_id", jobId).maybeSingle();
    if (saved) return NextResponse.json({ ok: true, content: saved.content, saved: true });
  }
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  if (!rateLimit(`prep:${user.id}`, 20, 3600_000)) return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`prep:${user.id}`)}s.` }, { status: 429 });

  const [{ data: job }, { data: p }] = await Promise.all([
    db.from("jobs").select("title, location, description, company_name, companies(name)").eq("id", jobId).maybeSingle(),
    db.from("profiles").select("current_role, years_in_sales, quota_attainment_pct, meetings_per_month, segment, motion, tools, cv_text").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!job) return NextResponse.json({ error: "That role no longer exists." }, { status: 404 });
  if (!p?.cv_text || p.cv_text.length < 200) return NextResponse.json({ error: "Upload your CV on My profile first. Prep only uses facts from your CV." }, { status: 400 });

  const company = (job.companies as unknown as { name: string } | null)?.name ?? job.company_name ?? "the company";
  const scorecard = [
    p.current_role && `Current role: ${p.current_role}`, p.years_in_sales && `Years in sales: ${p.years_in_sales}`,
    p.quota_attainment_pct && `Quota attainment: ${p.quota_attainment_pct}%`, p.meetings_per_month && `Meetings per month: ${p.meetings_per_month}`,
    p.segment && `Segment: ${p.segment}`, p.motion && `Motion: ${p.motion}`, p.tools?.length && `Tools: ${p.tools.join(", ")}`,
  ].filter(Boolean).join("\n");

  try {
    const content = await aiText(SYSTEM,
      `JOB: ${job.title} at ${company} (${job.location})\n${htmlToText(job.description ?? "").slice(0, 6000)}\n\nSCORECARD:\n${scorecard || "(none on file)"}\n\nCV (the only source of facts):\n${p.cv_text.slice(0, 10000)}`,
      { maxTokens: 1500, smart: true });
    if (!content) return NextResponse.json({ error: "The AI gave no answer. Try again." }, { status: 502 });
    await db.from("interview_preps").upsert({ user_id: user.id, job_id: jobId, content, created_at: new Date().toISOString() }, { onConflict: "user_id,job_id" });
    return NextResponse.json({ ok: true, content, saved: false });
  } catch (e) {
    console.error("prep failed:", e);
    return NextResponse.json({ error: "Couldn't write the prep. Try again." }, { status: 502 });
  }
}
