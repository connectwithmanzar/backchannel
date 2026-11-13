import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiJson, aiText, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { htmlToText } from "@/lib/collector/fetchers";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface StructuredBattlecard {
  intel: {
    whatTheyDo: string;
    targetBuyers: string;
    whyHiring: string;
  };
  matchedQuestions: {
    question: string;
    recommendedStory: string;
    keyTalkingPoint: string;
  }[];
  killerQuestions: string[];
  plan30_60_90: {
    days30: string;
    days60: string;
    days90: string;
  };
  executivePitchDm: string;
}

const BATTLECARD_SYSTEM = `You are an elite B2B sales career coach preparing a candidate for an interview.
${DATA_NOTICE}
Analyze the job description, company, and the candidate's CV, scorecard, and Story Bank.

CRITICAL RULES:
1. Use ONLY facts from the candidate's CV and Story Bank. Never invent metrics, employers, or tools.
2. Direct, authentic practitioner tone. No corporate clichés or AI tells.
3. Match real questions to the candidate's actual stories (e.g. Taboola $2M+ pipeline, $500K enterprise turnaround, Clay 60% research automation, 23-person startup grit).
4. For the 30-60-90 Day Plan: write concrete, tactical actions (e.g. "Audit existing CRM accounts, map top 50 ICP targets in Clay").
5. For the 50-word Executive Pitch DM: punchy note the candidate can send to the hiring manager on LinkedIn.

Return JSON:
{
  "intel": {
    "whatTheyDo": "1-2 sentences on company product and value prop",
    "targetBuyers": "Key buyer personas and ICP",
    "whyHiring": "The commercial growth hurdle this role solves"
  },
  "matchedQuestions": [
    {
      "question": "Likely interview question",
      "recommendedStory": "Story from candidate's bank to cite",
      "keyTalkingPoint": "Exact numbers and tactics to mention"
    }
  ],
  "killerQuestions": [
    "High-signal question 1 to ask interviewer",
    "High-signal question 2 to ask interviewer",
    "High-signal question 3 to ask interviewer"
  ],
  "plan30_60_90": {
    "days30": "Ramp & account mapping in Month 1",
    "days60": "First outbound pipeline & pilot deals in Month 2",
    "days90": "Quota pacing and repeatable playbook in Month 3"
  },
  "executivePitchDm": "50-word LinkedIn DM to hiring manager"
}`;

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
    if (saved?.content) {
      try {
        const parsed = JSON.parse(saved.content);
        if (parsed.intel && parsed.matchedQuestions) {
          return NextResponse.json({ ok: true, battlecard: parsed, content: renderBattlecardText(parsed), saved: true });
        }
      } catch {
        // legacy plain text content
        return NextResponse.json({ ok: true, content: saved.content, saved: true });
      }
    }
  }

  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  if (!(await rateLimitShared(`prep:${user.id}`, 20, 3600_000))) {
    return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`prep:${user.id}`)}s.` }, { status: 429 });
  }

  const [{ data: job }, { data: p }, { data: stories }] = await Promise.all([
    db.from("jobs").select("title, location, description, company_name, companies(name)").eq("id", jobId).maybeSingle(),
    db.from("profiles").select("current_role, years_in_sales, quota_attainment_pct, meetings_per_month, segment, motion, tools, cv_text").eq("user_id", user.id).maybeSingle(),
    db.from("stories").select("title, situation, action, result").eq("user_id", user.id).limit(10),
  ]);

  if (!job) return NextResponse.json({ error: "That role no longer exists." }, { status: 404 });
  if (!p?.cv_text || p.cv_text.length < 200) {
    return NextResponse.json({ error: "Upload your CV on My profile first. Prep only uses facts from your CV." }, { status: 400 });
  }

  const company = (job.companies as unknown as { name: string } | null)?.name ?? job.company_name ?? "the company";
  const scorecard = [
    p.current_role && `Current role: ${p.current_role}`,
    p.years_in_sales && `Years in sales: ${p.years_in_sales}`,
    p.quota_attainment_pct && `Quota attainment: ${p.quota_attainment_pct}%`,
    p.meetings_per_month && `Meetings per month: ${p.meetings_per_month}`,
    p.segment && `Segment: ${p.segment}`,
    p.motion && `Motion: ${p.motion}`,
    p.tools?.length && `Tools: ${p.tools.join(", ")}`,
  ].filter(Boolean).join("\n");

  const storyBank = (stories ?? []).length > 0
    ? (stories ?? []).map((s) => `• "${s.title}": ${s.action} -> Result: ${s.result}`).join("\n")
    : "No standalone stories logged yet. Use verified CV achievements.";

  try {
    const battlecard = await aiJson<StructuredBattlecard>(
      BATTLECARD_SYSTEM,
      `JOB: ${job.title} at ${company} (${job.location})\n` +
      `JOB DESCRIPTION:\n${untrusted("job_description", htmlToText(job.description ?? "").slice(0, 6000))}\n\n` +
      `CANDIDATE STORY BANK:\n${storyBank}\n\n` +
      `CANDIDATE SCORECARD:\n${scorecard || "(none on file)"}\n\n` +
      `CANDIDATE CV:\n${p.cv_text.slice(0, 10000)}`,
      { smart: true, maxTokens: 2500 }
    );

    const renderedText = renderBattlecardText(battlecard);
    // Store JSON string so structured data is retained
    await db.from("interview_preps").upsert(
      { user_id: user.id, job_id: jobId, content: JSON.stringify(battlecard), created_at: new Date().toISOString() },
      { onConflict: "user_id,job_id" }
    );

    return NextResponse.json({ ok: true, battlecard, content: renderedText, saved: false });
  } catch (e) {
    console.error("prep failed:", e);
    return NextResponse.json({ error: "Couldn't write the prep. Try again." }, { status: 502 });
  }
}

function renderBattlecardText(b: StructuredBattlecard): string {
  if (!b) return "";
  return [
    `Likely questions:\n${(b.matchedQuestions || []).map((q) => `- ${q.question} (Use: ${q.recommendedStory}): ${q.keyTalkingPoint}`).join("\n")}`,
    `Questions to ask them:\n${(b.killerQuestions || []).map((q) => `- ${q}`).join("\n")}`,
    `30-60-90 Day Plan:\n- 30 Days: ${b.plan30_60_90?.days30}\n- 60 Days: ${b.plan30_60_90?.days60}\n- 90 Days: ${b.plan30_60_90?.days90}`,
    `Executive Pitch DM:\n${b.executivePitchDm}`,
  ].join("\n\n");
}
