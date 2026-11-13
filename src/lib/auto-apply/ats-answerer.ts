import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson, hasAIKey, untrusted, DATA_NOTICE, NO_AI_MESSAGE } from "@/lib/ai";
import { matchSensitive } from "@/lib/apps/prepare";

export interface CandidateStory {
  title: string;
  situation: string;
  action: string;
  result: string;
}

export interface CandidatePersona {
  name: string;
  currentRole: string;
  yearsInSales?: number;
  quotaAttainmentPct?: number;
  meetingsPerMonth?: number;
  segment?: string;
  motion?: string;
  tools: string[];
  gapLine?: string;
  cvText: string;
  stories: CandidateStory[];
  savedAnswers: Record<string, string>;
}

export interface AtsQuestionInput {
  q: string;
  kind?: "text" | "select" | "radio" | "checkbox";
  options?: string[];
  existingAnswer?: string;
}

export interface AtsAnswerResult {
  answer: string;
  needsYou: boolean;
  reason?: string;
  storyUsed?: string;
  isSensitive: boolean;
  sensitiveKey?: string;
}

/**
 * Common robotic AI phrases and corporate jargon that must NEVER appear
 * in ATS question answers or outreach copy.
 */
export const BANNED_AI_CLICHES = [
  /\bI am thrilled to\b/gi,
  /\btestament to\b/gi,
  /\bspearheaded\b/gi,
  /\bdelve into\b/gi,
  /\bharness the power\b/gi,
  /\bmultifaceted\b/gi,
  /\bleverage my skills\b/gi,
  /\bleveraging my\b/gi,
  /\bin conclusion\b/gi,
  /\bfostered synergy\b/gi,
  /\bsynergistic\b/gi,
  /\bI believe I am an ideal fit\b/gi,
  /\bbeacon of\b/gi,
  /\bcatalyst for\b/gi,
  /\bpassionate about driving\b/gi,
  /\bdynamic environment\b/gi,
  /\bproven track record of excellence\b/gi,
  /\bthroughout my professional journey\b/gi,
  /\bI am excited to submit\b/gi,
];

/**
 * Replaces or flags AI clichés with authentic, plain practitioner language.
 */
export function scrubAiClichés(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\bI am thrilled to apply for\b/gi, "I am applying for");
  cleaned = cleaned.replace(/\bI am excited to apply for\b/gi, "I am applying for");
  cleaned = cleaned.replace(/\bthroughout my professional journey\b/gi, "across my 5 years in outbound GTM");
  cleaned = cleaned.replace(/\btestament to my dedication\b/gi, "direct result of my outbound focus");
  cleaned = cleaned.replace(/\bspearheaded\b/gi, "led");
  cleaned = cleaned.replace(/\bharness the power of\b/gi, "use");
  cleaned = cleaned.replace(/\bmultifaceted\b/gi, "cross-functional");
  cleaned = cleaned.replace(/\bin conclusion,?\b/gi, "");
  cleaned = cleaned.replace(/\bfostered synergy\b/gi, "aligned teams");
  cleaned = cleaned.replace(/\bI believe I am an ideal fit because\b/gi, "My relevant track record is:");
  return cleaned.trim();
}

/**
 * Loads the complete, deep candidate brain for a user from Supabase.
 */
export async function loadCandidatePersona(db: SupabaseClient, userId: string): Promise<CandidatePersona> {
  const [{ data: profile }, { data: prefs }, { data: stories }] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("preferences").select("standard_answers, auto_apply_use_saved").eq("user_id", userId).maybeSingle(),
    db.from("stories").select("title, situation, action, result").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    name: profile?.name || "Applicant",
    currentRole: profile?.current_role || "Go-To-Market Specialist",
    yearsInSales: profile?.years_in_sales ?? undefined,
    quotaAttainmentPct: profile?.quota_attainment_pct ?? undefined,
    meetingsPerMonth: profile?.meetings_per_month ?? undefined,
    segment: profile?.segment || "Enterprise",
    motion: profile?.motion || "Outbound",
    tools: profile?.tools || ["Salesforce", "Clay", "HubSpot", "LinkedIn Sales Navigator", "ZoomInfo", "Apollo"],
    gapLine: profile?.gap_line || "",
    cvText: profile?.cv_text || "",
    stories: (stories || []).map((s) => ({
      title: s.title,
      situation: s.situation,
      action: s.action,
      result: s.result,
    })),
    savedAnswers: (prefs?.standard_answers || {}) as Record<string, string>,
  };
}

const HUMAN_ANSWER_SYSTEM = `You are the candidate's executive career agent who knows them better than they know themselves.
${DATA_NOTICE}
You answer ATS application form questions on their behalf. Hiring managers and recruiters read hundreds of applications — standard AI answers (generic enthusiasm, fluffy buzzwords, zero numbers) get candidates rejected immediately.

YOUR INSTRUCTIONS:
1. SOUND 100% HUMAN, GROUNDED, AND PRACTITIONER-LEVEL:
   - Start IN MEDIAS RES. Answer the question directly in sentence 1.
   - Absolutely NO throat-clearing ("I am thrilled to apply", "Throughout my career", "I believe I am a strong fit").
   - Tone: Confident, direct, analytical, respectful of the reader's time. A top 1% B2B revenue operator talking peer-to-peer with another senior operator.
   - Use SHORT, punchy sentences mixed with specifics.

2. GROUND EVERY CLAIM IN THE CANDIDATE'S ACTUAL NUMBERS & STORIES:
   - Use exact figures and tools from the Candidate's Story Bank, Scorecard, and CV ($2M+ pipeline, $350K closed-won, $500K enterprise deal, Clay workflows cutting research by 60%, scaling teams 3 to 10 reps, Prada/Uniqlo/Zalando accounts).
   - If a question asks for a specific behavioral example ("Tell us about a time...", "Describe a difficult deal..."), pull from the Story Bank with Situation -> Action -> Quantified Result.
   - For "Why this company?": Pinpoint a real technical/product challenge from their job description and explain why the candidate's specific outbound and enterprise mapping experience directly solves it.
   - NEVER invent facts, employers, tools, or metrics not grounded in the candidate's profile.

3. LENGTH CONSTRAINTS:
   - Unless explicitly instructed otherwise, keep answers between 45 and 95 words (2 to 4 sentences max).
   - For multiple choice / dropdowns: answer must match one option character-for-character.

Return JSON format:
{
  "answerable": true,
  "answer": "Grounded, punchy human answer.",
  "story_used": "Title of story used if behavioral, or null"
}`;

/**
 * Generates an impressive, authentic, non-AI answer to a single ATS question.
 */
export async function generateHumanAtsAnswer(
  q: string,
  persona: CandidatePersona,
  jobContext: { title: string; company: string; description?: string },
  opts?: { kind?: string; options?: string[] }
): Promise<AtsAnswerResult> {
  const sensitiveKey = matchSensitive(q);

  // 1. Sensitive questions (Visa, Salary, Notice Period, Location)
  if (sensitiveKey) {
    const saved = persona.savedAnswers[sensitiveKey];
    if (saved && saved.trim()) {
      if (opts?.options && opts.options.length > 0) {
        // Pick best matching option
        const match = opts.options.find(
          (o) => o.toLowerCase().trim() === saved.toLowerCase().trim() ||
                 o.toLowerCase().includes(saved.toLowerCase().trim())
        );
        return {
          answer: match || saved,
          needsYou: false,
          isSensitive: true,
          sensitiveKey,
        };
      }
      return {
        answer: saved,
        needsYou: false,
        isSensitive: true,
        sensitiveKey,
      };
    }
    return {
      answer: "",
      needsYou: true,
      reason: `Requires your standing answer for ${sensitiveKey.replace(/_/g, " ")}. Save it in Profile or fill it here.`,
      isSensitive: true,
      sensitiveKey,
    };
  }

  // 2. Options-based question (Dropdown / Radio)
  if (opts?.options && opts.options.length > 0) {
    const lowerQ = q.toLowerCase();
    // Common boolean or standard choices
    if (lowerQ.includes("years of experience") || lowerQ.includes("how many years")) {
      const yrs = persona.yearsInSales || 5;
      const matched = opts.options.find((o) => o.includes(`${yrs}`) || o.includes("5+"));
      if (matched) return { answer: matched, needsYou: false, isSensitive: false };
    }
    if (lowerQ.includes("legally authorized") || lowerQ.includes("authorized to work")) {
      const yes = opts.options.find((o) => /^yes\b/i.test(o));
      if (yes) return { answer: yes, needsYou: false, isSensitive: false };
    }
  }

  // 3. Open-ended / Behavioral / Motivation question
  if (!hasAIKey()) {
    return {
      answer: "",
      needsYou: true,
      reason: NO_AI_MESSAGE,
      isSensitive: false,
    };
  }

  const storiesFormatted = persona.stories.length > 0
    ? persona.stories.map((s) => `• STORY: "${s.title}"\n  Situation: ${s.situation}\n  Action: ${s.action}\n  Result: ${s.result}`).join("\n\n")
    : "No standalone stories logged yet. Extract proven wins directly from CV.";

  const scorecardSummary = [
    `Current Role: ${persona.currentRole}`,
    persona.yearsInSales ? `Years in B2B GTM: ${persona.yearsInSales}` : null,
    persona.segment ? `Target Segment: ${persona.segment}` : null,
    persona.motion ? `Sales Motion: ${persona.motion}` : null,
    persona.tools.length ? `Tools: ${persona.tools.join(", ")}` : null,
    persona.gapLine ? `Career Gap Context: ${persona.gapLine}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `QUESTION ASKED BY ATS / HIRING TEAM:
"${untrusted("question", q)}"

JOB CONTEXT:
Role: ${jobContext.title} at ${jobContext.company}
${jobContext.description ? `Job Details snippet:\n${untrusted("job_desc", jobContext.description.slice(0, 3000))}` : ""}

CANDIDATE STORY BANK & PROVEN WINS (The Agent's secret weapon):
${storiesFormatted}

CANDIDATE SCORECARD & METRICS:
${scorecardSummary}

CANDIDATE CV DETAILS:
${persona.cvText.slice(0, 10000)}

${opts?.options?.length ? `OPTIONS (Pick ONE exactly):\n${opts.options.map((o) => `- ${o}`).join("\n")}` : "Format: Free text (45-95 words, punchy, zero fluff, direct numbers)."}`;

  try {
    const res = await aiJson<{ answerable?: boolean; answer?: string; story_used?: string }>(
      HUMAN_ANSWER_SYSTEM,
      prompt,
      { smart: true, maxTokens: 800 }
    );

    const rawAnswer = String(res.answer || "").trim();
    if (!res.answerable || !rawAnswer) {
      return {
        answer: "",
        needsYou: true,
        reason: `Could not find verified background in CV for "${q}".`,
        isSensitive: false,
      };
    }

    const cleaned = scrubAiClichés(rawAnswer);
    return {
      answer: cleaned,
      needsYou: false,
      storyUsed: res.story_used || undefined,
      isSensitive: false,
    };
  } catch (err) {
    return {
      answer: "",
      needsYou: true,
      reason: (err as Error).message,
      isSensitive: false,
    };
  }
}

/**
 * Extracts 4-6 proven STAR stories from a candidate's CV text.
 */
export async function extractStoriesFromCv(cvText: string): Promise<CandidateStory[]> {
  if (!hasAIKey()) throw new Error(NO_AI_MESSAGE);

  const prompt = `Analyze this candidate's CV and extract 4 to 6 battle-tested, high-impact STAR stories (Situation, Action, Result with concrete metrics).
Focus on:
1. Their biggest revenue or pipeline win (e.g. $2M+ pipeline, $350K closed-won, large enterprise deal).
2. A technical workflow or automation win (e.g. Clay workflows reducing research time 60%).
3. A leadership, startup grit, or scaling accomplishment (e.g. bootstrapping 23-person firm, scaling team 3 to 10 reps).
4. A complex account turnaround or breakthrough (e.g. turning cold prospect into $500K partnership).

CANDIDATE CV:
${cvText.slice(0, 12000)}

Return JSON:
{
  "stories": [
    {
      "title": "Short descriptive title (max 80 chars)",
      "situation": "The exact problem, quota hurdle, or friction point",
      "action": "What the candidate independently did, which tools and strategy they used",
      "result": "Tangible outcome backed by exact numbers/percentages"
    }
  ]
}`;

  const res = await aiJson<{ stories: CandidateStory[] }>(
    `You extract quantitative, human STAR stories from CVs for interview kits. ${DATA_NOTICE} Never invent facts.`,
    prompt,
    { smart: true, maxTokens: 2500 }
  );

  return res.stories || [];
}
