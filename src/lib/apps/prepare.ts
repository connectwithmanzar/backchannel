export { SENSITIVE_LABELS } from "./labels";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson, hasAIKey, NO_AI_MESSAGE } from "@/lib/ai";
import { htmlToText } from "@/lib/collector/fetchers";


export type AppQuestion = { q: string; answer: string; sensitive: boolean; key?: string };
type Prepared = { tailored_cv: string; changes: string[]; cover_note: string; questions: AppQuestion[] };

const SYSTEM = `You prepare job applications for a B2B sales professional. Absolute rules:
- Use ONLY facts in the candidate's CV and scorecard. Never invent employers, titles, dates, numbers, tools, skills or achievements.
- Tailoring means reordering, trimming and rewording existing bullets toward the job. If a requirement isn't met, don't claim it.
- Write in plain, confident English. No buzzwords, no em-dashes.
- Sensitive questions (visa or sponsorship, work authorisation, salary or OTE expectations, notice period, current location, relocation, diversity or demographics) must NEVER be answered by you. Mark them sensitive with an empty answer; the app fills them from the candidate's saved answers.`;

/** Builds a tailored CV, cover note and answers for one role, and saves it as an application. */
export async function prepareApplication(db: SupabaseClient, userId: string, jobId: string) {
  if (!hasAIKey()) throw new Error(NO_AI_MESSAGE);
  const [{ data: profile }, { data: prefs }, { data: job }] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("preferences").select("standard_answers").eq("user_id", userId).maybeSingle(),
    db.from("jobs").select("id, title, location, url, description, companies(name)").eq("id", jobId).single(),
  ]);
  if (!job) throw new Error("That role no longer exists.");
  if (!profile?.cv_text || profile.cv_text.length < 200) {
    throw new Error("Upload your CV on My profile first. Autopilot only uses facts from your CV.");
  }
  const company = (job.companies as unknown as { name: string } | null)?.name ?? "the company";
  const scorecard = [
    profile.current_role && `Current role: ${profile.current_role}`,
    profile.years_in_sales && `Years in sales: ${profile.years_in_sales}`,
    profile.quota_attainment_pct && `Quota attainment: ${profile.quota_attainment_pct}%`,
    profile.meetings_per_month && `Meetings per month: ${profile.meetings_per_month}`,
    profile.segment && `Segment: ${profile.segment}`,
    profile.motion && `Motion: ${profile.motion}`,
    profile.tools?.length && `Tools: ${profile.tools.join(", ")}`,
  ].filter(Boolean).join("\n");

  const out = await aiJson<Prepared>(SYSTEM, `JOB: ${job.title} at ${company} (${job.location})
JOB DESCRIPTION:
${htmlToText(job.description ?? "").slice(0, 7000)}

CANDIDATE SCORECARD:
${scorecard}

CANDIDATE CV (the only source of facts):
${profile.cv_text.slice(0, 12000)}

Return JSON:
{
  "tailored_cv": "the full CV rewritten for this job as plain text with simple headings and '- ' bullets, using only facts above",
  "changes": ["up to 6 short notes on what you reordered or reworded and why"],
  "cover_note": "a 90-140 word note to the hiring team, specific to this job, first person, no greeting line",
  "questions": [{"q": "a question this application form is likely to ask", "answer": "answer from the CV, or empty if sensitive", "sensitive": false}]
}
Include 5-8 questions: always include visa sponsorship, salary expectation and notice period (sensitive), plus role-specific ones like 'Why this company?' or 'Describe your outbound process'.`, { maxTokens: 4000, smart: true });

  // Fill sensitive questions from saved answers; anything missing needs the user's input.
  const saved = (prefs?.standard_answers ?? {}) as Record<string, string>;
  const questions: AppQuestion[] = (out.questions ?? []).map((q) => {
    const key = matchSensitive(q.q);
    if (key || q.sensitive) return { q: q.q, sensitive: true, key: key ?? undefined, answer: key ? saved[key] ?? "" : "" };
    return { q: q.q, answer: q.answer ?? "", sensitive: false };
  });
  const missing = questions.some((q) => q.sensitive && !q.answer.trim());

  const row = {
    user_id: userId, job_id: jobId,
    status: missing ? "needs_answer" : "awaiting_approval",
    tailored_cv: out.tailored_cv ?? "", cv_changes: out.changes ?? [], cover_note: out.cover_note ?? "",
    questions, pending_question: missing ? questions.find((q) => q.sensitive && !q.answer)?.q ?? null : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("applications").upsert(row, { onConflict: "user_id,job_id" }).select("id").single();
  if (error) throw new Error(`Saving the application failed: ${error.message}`);
  return { id: data.id as string, status: row.status };
}

export function matchSensitive(q: string): string | null {
  const t = q.toLowerCase();
  if (/sponsor|visa/.test(t)) return "visa_sponsorship";
  if (/authori[sz]|right to work|eligible to work|work permit/.test(t)) return "work_authorisation";
  if (/salary|compensation|ote|pay expectation|expected pay|ctc/.test(t)) return "salary_expectation";
  if (/notice period|start date|when can you start|availability to start/.test(t)) return "notice_period";
  if (/relocat/.test(t)) return "willing_to_relocate";
  if (/where are you (based|located)|current location|city of residence/.test(t)) return "current_location";
  if (/gender|ethnic|race|disab|veteran|pronoun|sexual orientation|religion/.test(t)) return "diversity";
  return null;
}
