// Copilots: saved job searches. Pure logic only (cleaning input, matching a job, learning from your reactions) so it is easy to test.

export const SENIORITY_LEVELS = ["entry", "junior", "mid", "senior", "lead", "director"] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  entry: "Intern / entry",
  junior: "Junior / associate",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead / manager",
  director: "Director and above",
};

export const MAX_COPILOTS = 10;
export const MAX_TITLES = 5;
const MAX_LIST = 10;

export interface Copilot {
  id: string;
  name: string;
  titles: string[];
  remote: boolean;
  remoteRegions: string[];
  onsite: boolean;
  places: string[];
  seniority: Seniority[];
  excludeWords: string[];
  isOn: boolean;
}

export type CopilotInput = Omit<Copilot, "id" | "isOn">;

export interface JobLike {
  title: string;
  location?: string | null;
  remote_type?: string | null;
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function cleanList(v: unknown, max: number, len: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const text = clip(item, len);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/** Turns whatever the browser sent into a safe Copilot, or says what is wrong in plain words. */
export function cleanCopilotInput(raw: unknown): { ok: true; value: CopilotInput } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const titles = cleanList(b.titles, MAX_TITLES, 80);
  if (titles.length === 0) return { ok: false, error: "Add at least one job title." };
  const remote = b.remote === true;
  const onsite = b.onsite === true;
  if (!remote && !onsite) return { ok: false, error: "Choose remote jobs, on-site jobs, or both." };
  const seniority = cleanList(b.seniority, SENIORITY_LEVELS.length, 20).filter((s): s is Seniority => (SENIORITY_LEVELS as readonly string[]).includes(s));
  const name = clip(b.name, 60) || titles.slice(0, 2).join(", ");
  return {
    ok: true,
    value: {
      name,
      titles,
      remote,
      remoteRegions: remote ? cleanList(b.remoteRegions, MAX_LIST, 60) : [],
      onsite,
      places: onsite ? cleanList(b.places, MAX_LIST, 60) : [],
      seniority,
      excludeWords: cleanList(b.excludeWords, MAX_LIST, 40),
    },
  };
}

const STOP_WORDS = new Set(["a", "an", "and", "of", "the", "for", "to", "in"]);

export function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#]+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** True when every word of the wanted title starts a word in the job title ("sales development" fits "Sales Development Representative"). */
export function titleMatches(wanted: string, jobTitle: string): boolean {
  const need = tokens(wanted);
  if (need.length === 0) return false;
  const have = tokens(jobTitle);
  return need.every((n) => have.some((h) => h === n || h.startsWith(n)));
}

/** Reads the level from the words in a job title. Titles with no level word count as mid level. */
export function titleSeniority(title: string): Seniority {
  const t = ` ${title.toLowerCase()} `;
  if (/\b(director|vp|vice president|chief|cxo|president|head of)\b/.test(t)) return "director";
  if (/\b(lead|manager|principal|team lead|head)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|staff)\b/.test(t)) return "senior";
  if (/\b(intern|internship|trainee|graduate|entry)\b/.test(t)) return "entry";
  if (/\b(junior|jr\.?|associate)\b/.test(t)) return "junior";
  return "mid";
}

function isRemoteJob(job: JobLike): boolean {
  return job.remote_type === "remote" || /\bremote\b/i.test(job.location ?? "");
}

const ANYWHERE = /\b(worldwide|anywhere|global|international)\b/i;

/** True when the job fits this Copilot: title, level, words to avoid, and where it is. */
export function matchesCopilot(c: Pick<Copilot, "titles" | "remote" | "remoteRegions" | "onsite" | "places" | "seniority" | "excludeWords">, job: JobLike): boolean {
  if (!c.titles.some((t) => titleMatches(t, job.title))) return false;
  const lower = job.title.toLowerCase();
  if (c.excludeWords.some((w) => w && lower.includes(w.toLowerCase()))) return false;
  if (c.seniority.length > 0 && !c.seniority.includes(titleSeniority(job.title))) return false;

  const where = job.location ?? "";
  if (isRemoteJob(job)) {
    if (!c.remote) return false;
    if (c.remoteRegions.length === 0 || where.trim() === "" || ANYWHERE.test(where)) return true;
    return c.remoteRegions.some((r) => where.toLowerCase().includes(r.toLowerCase()) || ANYWHERE.test(r));
  }
  if (!c.onsite) return false;
  if (c.places.length === 0) return true;
  return c.places.some((p) => where.toLowerCase().includes(p.toLowerCase()));
}

/** Words that show up in the titles of jobs you kept, so similar jobs can rank higher. */
export function keptWords(keptTitles: string[]): Set<string> {
  const words = new Set<string>();
  for (const title of keptTitles) for (const t of tokens(title)) words.add(t);
  return words;
}

/** How many words of this title appear in jobs you kept. Higher means more like what you chose before. */
export function keptScore(title: string, kept: Set<string>): number {
  return tokens(title).filter((t) => kept.has(t)).length;
}

/** One line describing where a Copilot looks, for its card. */
export function describeWhere(c: Pick<Copilot, "remote" | "remoteRegions" | "onsite" | "places">): string {
  const parts: string[] = [];
  if (c.remote) parts.push(`Remote ${c.remoteRegions.length ? c.remoteRegions.join(", ") : "anywhere"}`);
  if (c.onsite) parts.push(`On-site ${c.places.length ? c.places.join(", ") : "anywhere"}`);
  return parts.join(" · ");
}
