import { aiJson, DATA_NOTICE, hasAIKey, untrusted } from "@/lib/ai";
import { countryOf, openToIndia } from "@/lib/role-filters";

export interface Eligibility { verdict: "yes" | "no" | "unclear"; reason: string }
export interface AiRead { india: Eligibility; fits: string[]; gaps: string[]; byAi: boolean }
export interface ReadInput { title: string; company: string; location: string; remote: boolean; text: string }
export interface ReaderProfile { name?: string | null; cv_text?: string | null; tools?: string[] | null }

type AiFn = <T>(system: string, user: string, opts?: { maxTokens?: number; fast?: boolean }) => Promise<T>;

const VERDICTS = ["yes", "no", "unclear"];
const short = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => short(x, 180)).filter(Boolean).slice(0, max);

/** What the rules alone can say about India. A posting located in India is a yes without asking anyone. */
export function ruleEligibility(i: Pick<ReadInput, "location" | "remote">): Eligibility {
  if (countryOf(i.location) === "India") return { verdict: "yes", reason: `The posting's location is ${i.location}.` };
  if (openToIndia(i.location, i.remote ? "remote" : "unknown")) return { verdict: "yes", reason: "It is remote with no country limit." };
  return { verdict: i.location.trim() ? "no" : "unclear", reason: i.location.trim() ? `The location is ${i.location}, outside India.` : "The page does not say where the job is." };
}

const SYSTEM = `You read one job posting for a sales professional who lives in India and decide whether they can apply and what fits them.
${DATA_NOTICE}
Rules: use ONLY the posting and the candidate facts given. Never invent facts about the candidate or the company.
"india": can a person living in India apply? "yes" if the job is in India, or remote and open to India, APAC or worldwide. "no" only if the posting clearly requires being in or authorised to work in another country with no remote option for India. "unclear" if the posting does not say. "reason" is one short sentence that points to the evidence in the posting.
"fits": up to 3 short points (under 22 words each) where the posting matches what the candidate facts show. "gaps": up to 2 short points where the posting asks for something the candidate facts do not show. Plain words, no hype.
Return JSON: {"india": {"verdict": "yes"|"no"|"unclear", "reason": string}, "fits": string[], "gaps": string[]}`;

/**
 * Has the AI read the posting the way a person would. The rules decide when they are sure (a job in India is a yes);
 * the AI judges everything else and writes the reasons. If the AI is off or fails, the rules answer alone.
 */
export async function aiReadPosting(i: ReadInput, profile: ReaderProfile | null, ai: AiFn = aiJson as AiFn, aiOn: boolean = hasAIKey()): Promise<AiRead> {
  const rules = ruleEligibility(i);
  if (!aiOn) return { india: rules, fits: [], gaps: [], byAi: false };
  try {
    const facts = [profile?.tools?.length ? `Tools: ${profile.tools.join(", ")}` : "", profile?.cv_text ? `CV excerpt:\n${profile.cv_text.slice(0, 2500)}` : "No CV has been added yet."].filter(Boolean).join("\n");
    const out = await ai<{ india?: { verdict?: string; reason?: string }; fits?: unknown; gaps?: unknown }>(
      SYSTEM,
      `CANDIDATE FACTS:\n${facts}\n\nJOB: ${i.title} at ${i.company || "an unnamed company"}. Location shown: ${i.location || "not shown"}${i.remote ? " (remote)" : ""}\n${untrusted("job_description", i.text.slice(0, 6000))}`,
      { maxTokens: 500, fast: true },
    );
    const verdict = VERDICTS.includes(out.india?.verdict ?? "") ? (out.india!.verdict as Eligibility["verdict"]) : rules.verdict;
    const aiReason = short(out.india?.reason, 200);
    // A posting located in India stays a yes, whatever the AI says.
    const india: Eligibility = rules.verdict === "yes" && countryOf(i.location) === "India" ? rules : { verdict, reason: aiReason || rules.reason };
    return { india, fits: list(out.fits, 3), gaps: list(out.gaps, 2), byAi: true };
  } catch {
    return { india: rules, fits: [], gaps: [], byAi: false };
  }
}
