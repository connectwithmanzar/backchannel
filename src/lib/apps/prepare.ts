export { SENSITIVE_LABELS } from "./labels";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { unsupportedNumbers } from "./faithfulness";
import { htmlToText } from "@/lib/collector/fetchers";
import { isBlocked } from "@/lib/outreach/engine";


export type AppQuestion = { q: string; answer: string; sensitive: boolean; key?: string };
type Prepared = { tailored_cv: string; changes: string[]; cover_note: string; questions: AppQuestion[] };

const SYSTEM = `You are an elite career agent who knows this B2B sales professional better than they know themselves.
${DATA_NOTICE}
You prepare job applications (tailored CV, cover note, and form answers) that stand out to senior sales leaders and pass ATS parsing with high scores.

CORE WRITING PRINCIPLES:
1. SOUND 100% HUMAN & AUTHENTIC:
   - Ban all robotic AI tells and generic corporate jargon. NEVER write "I am thrilled to apply", "testament to", "spearheaded", "dynamic environment", "in conclusion", "furthermore", "fostered synergy", or "I believe I am an ideal fit".
   - Write in the voice of a top-performing, grounded sales practitioner. Confident, direct, respectful of time, and revenue-focused.
   - Use natural sentence structures with varied length. Avoid bloated adjectives.

2. ANSWERING ATS & APPLICATION QUESTIONS:
   - For behavioral or technical questions (e.g. "Describe your outbound process", "Why this company?", "Describe a difficult deal you closed"):
     * ANSWER DIRECTLY in sentence 1. Zero introductory throat-clearing.
     * Back up every answer with exact tools, numbers, or situations from the candidate's CV, scorecard, or Story Bank.
     * Keep answers concise and punchy (2-4 sentences, 50-100 words max).
     * For "Why this company?": Connect a specific product/engineering detail from their job description directly to the candidate's actual domain experience and career trajectory.
   - SENSITIVE QUESTIONS: Visa sponsorship, work authorisation, salary expectations, notice period, location, diversity MUST NEVER be answered or guessed by you. Mark them sensitive with an empty answer ("").

3. TAILORING CV & COVER NOTE:
   - Use ONLY facts in the candidate's CV, scorecard, and Story Bank. Never invent employers, dates, quotas, numbers, tools, or achievements.
   - Tailor by highlighting, reordering, and elevating bullets that directly match the core requirements of this exact job description.
   - Cover note: 80-120 words max, punchy, conversational, no generic pleasantries, signed off with first name only.`;

/** Builds a tailored CV, cover note and answers for one role, and saves it as an application. */
export async function prepareApplication(db: SupabaseClient, userId: string, jobId: string) {
  if (!hasAIKey()) throw new Error(NO_AI_MESSAGE);
  const [{ data: profile }, { data: prefs }, { data: stories }, { data: job }] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("preferences").select("standard_answers, great_company_criteria, dealbreakers").eq("user_id", userId).maybeSingle(),
    db.from("stories").select("title, situation, action, result").eq("user_id", userId).limit(10),
    db.from("jobs").select("id, title, location, url, description, company_name, companies(name)").eq("id", jobId).single(),
  ]);
  if (!job) throw new Error("That role no longer exists.");
  if (!profile?.cv_text || profile.cv_text.length < 200) {
    throw new Error("Upload your CV on My profile first. Autopilot only uses facts from your CV.");
  }
  const company = (job.companies as unknown as { name: string } | null)?.name ?? job.company_name ?? "the company";
  if (await isBlocked(db, userId, "", company)) throw new Error(`${company} is on your excluded list, so no application will be prepared.`);
  
  const scorecard = [
    profile.current_role && `Current role: ${profile.current_role}`,
    profile.years_in_sales && `Years in sales: ${profile.years_in_sales}`,
    profile.quota_attainment_pct && `Quota attainment: ${profile.quota_attainment_pct}%`,
    profile.meetings_per_month && `Meetings per month: ${profile.meetings_per_month}`,
    profile.segment && `Segment: ${profile.segment}`,
    profile.motion && `Motion: ${profile.motion}`,
    profile.tools?.length && `Tools: ${profile.tools.join(", ")}`,
    profile.gap_line && `Career context / transition: ${profile.gap_line}`,
  ].filter(Boolean).join("\n");

  const storyBank = (stories ?? []).length > 0
    ? (stories ?? []).map((s) => `• WIN/STORY: "${s.title}"\n  - Situation: ${s.situation}\n  - Action: ${s.action}\n  - Result: ${s.result}`).join("\n\n")
    : "No standalone stories logged yet. Extract proven wins directly from CV achievements.";

  const out = await aiJson<Prepared>(SYSTEM, `JOB: ${job.title} at ${company} (${job.location})
JOB DESCRIPTION:
${untrusted("job_description", htmlToText(job.description ?? "").slice(0, 7000))}

CANDIDATE SCORECARD & METRICS:
${scorecard}

CANDIDATE STORY BANK & PROVEN WINS:
${storyBank}

CANDIDATE CV (the only source of background facts):
${profile.cv_text.slice(0, 12000)}

Return JSON:
{
  "tailored_cv": "the full CV rewritten for this job as plain text with simple headings and '- ' bullets, using only facts above",
  "changes": ["up to 6 short notes on what you reordered or reworded and why"],
  "cover_note": "a 80-120 word note to the hiring team, specific to this job, first person, no greeting line",
  "questions": [{"q": "a question this application form is likely to ask", "answer": "practitioner-level human answer with zero corporate fluff, or empty if sensitive", "sensitive": false}]
}
Include 5-8 questions: always include visa sponsorship, salary expectation and notice period (sensitive), plus role-specific ones like 'Why this company?' or 'Describe your outbound process'.`, { maxTokens: 4000, smart: true });

  // Flag any figure the model used that is not in the candidate's own CV or scorecard.
  const strange = unsupportedNumbers(`${out.tailored_cv ?? ""}\n${out.cover_note ?? ""}`, [profile.cv_text, scorecard]);
  if (strange.length) out.changes = [`Check before using: these numbers are not in your CV or scorecard: ${strange.join(", ")}. Remove them or correct them.`, ...(out.changes ?? [])];

  // Fill sensitive questions from saved answers; anything missing needs the user's input.
  const saved = (prefs?.standard_answers ?? {}) as Record<string, string>;
  const questions: AppQuestion[] = (out.questions ?? []).map((q) => {
    const key = matchSensitive(q.q);
    if (key || q.sensitive) return { q: q.q, sensitive: true, key: key ?? undefined, answer: key ? saved[key] ?? "" : "" };
    return { q: q.q, answer: q.answer ?? "", sensitive: false };
  });
  // Sensitive answers always stop for the user, even when prefilled from saved answers.
  const missing = questions.some((q) => q.sensitive);

  const row = {
    user_id: userId, job_id: jobId,
    status: missing ? "needs_answer" : "awaiting_approval",
    tailored_cv: out.tailored_cv ?? "", cv_changes: out.changes ?? [], cover_note: out.cover_note ?? "",
    questions, pending_question: missing ? questions.find((q) => q.sensitive)?.q ?? null : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("applications").upsert(row, { onConflict: "user_id,job_id" }).select("id").single();
  if (error) throw new Error(`Saving the application failed: ${error.message}`);
  return { id: data.id as string, status: row.status };
}

export function matchSensitive(q: string): string | null {
  const t = q.toLowerCase();
  if (/sponsor|visa|immigration/.test(t)) return "visa_sponsorship";
  if (/authori[sz]|right to work|eligible to work|allowed to work|legally (able|permitted)|work permit/.test(t)) return "work_authorisation";
  if (/salary|compensation|\bote\b|\bctc\b|pay (expectation|requirement)|expected pay|remuneration|\bpackage\b/.test(t)) return "salary_expectation";
  if (/notice period|start date|when can you start|availability to start|how soon can you (join|start)|joining (time|date)|earliest (start|joining)/.test(t)) return "notice_period";
  if (/relocat/.test(t)) return "willing_to_relocate";
  if (/where are you (based|located)|current location|city of residence/.test(t)) return "current_location";
  if (/\b(gender|ethnic\w*|race|racial|disabilit\w*|disabled|veteran|pronouns?|sexual orientation|religio\w*|caste|marital status|date of birth)\b/.test(t)) return "diversity";
  return null;
}
