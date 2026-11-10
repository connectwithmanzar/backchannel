export type Seniority = "entry" | "mid" | "senior" | "lead";

/** A rough level read from the job title. */
export function seniorityOf(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\b(head|director|vp|vice president|manager|lead|chief)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|principal|staff)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|associate|entry|intern|trainee|graduate)\b/.test(t)) return "entry";
  return "mid";
}

interface Searchable { title: string; company: string; location: string; description?: string }

/** Every word typed must appear in the title, company, location or description (any order, any case). */
export function matchesQuery(job: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${job.title} ${job.company} ${job.location} ${job.description ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function matchesLocation(job: { location: string }, query: string): boolean {
  const parts = query.toLowerCase().split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return !parts.length || parts.some((p) => job.location.toLowerCase().includes(p));
}

/** True when the role was posted (or first seen) within `days`. Unknown dates pass, so nothing disappears by accident. */
export function postedWithin(postedAt: string | undefined, days: number, now = Date.now()): boolean {
  if (!days || !postedAt) return true;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) || now - t <= days * 864e5;
}

const COUNTRIES: [RegExp, string][] = [
  [/\b(india|mumbai|bangalore|bengaluru|delhi|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata|ahmedabad)\b/i, "India"],
  [/\b(uae|united arab emirates|dubai|abu dhabi|sharjah)\b/i, "UAE"],
  [/\b(saudi|riyadh|jeddah|qatar|doha|kuwait|bahrain|oman)\b/i, "Gulf"],
  [/\b(uk|u\.k\.|united kingdom|england|scotland|london|manchester|edinburgh)\b/i, "UK"],
  [/\b(ireland|dublin)\b/i, "Ireland"],
  [/\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne)\b/i, "Germany"],
  [/\b(netherlands|amsterdam|rotterdam|utrecht)\b/i, "Netherlands"],
  [/\b(france|paris|lyon)\b/i, "France"],
  [/\b(spain|madrid|barcelona|portugal|lisbon|italy|milan|poland|warsaw|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|switzerland|zurich|austria|vienna|belgium|brussels|europe|emea)\b/i, "Europe"],
  [/\b(singapore)\b/i, "Singapore"],
  [/\b(australia|sydney|melbourne|new zealand|auckland)\b/i, "Australia"],
  [/\b(canada|toronto|vancouver|montreal)\b/i, "Canada"],
  [/\b(us|u\.s\.|usa|united states|new york|nyc|san francisco|bay area|austin|chicago|boston|seattle|denver|atlanta|los angeles|miami|dallas|north america)\b/i, "US"],
];

/** A short country label read from the location text, "Remote" for open-ended remote, or "Other" when unclear. */
export function countryOf(location: string): string {
  for (const [re, name] of COUNTRIES) if (re.test(location)) return name;
  if (/remote|anywhere|worldwide|global|international/i.test(location)) return "Remote";
  return "Other";
}

/**
 * True when someone living in India can plausibly take the role: it is in India, or it is remote and not tied to
 * another country. A role that names another country, even if remote ("Remote, USA only"), is not counted.
 */
export function openToIndia(location: string, remoteType: string): boolean {
  const country = countryOf(location);
  if (country === "India") return true;
  if (/\b(india|apac|asia)\b/i.test(location)) return true;
  return remoteType === "remote" && (country === "Remote" || (country === "Other" && /worldwide|anywhere|global|international/i.test(location)));
}

const SOURCE_NAMES: Record<string, string> = {
  greenhouse: "Company careers page", lever: "Company careers page", ashby: "Company careers page", smartrecruiters: "Company careers page",
  remotive: "Job feed · Remotive", arbeitnow: "Job feed · Arbeitnow", adzuna: "Job feed · Adzuna", pasted: "Added by you",
};
/** Where a role came from, in plain words. */
export const sourceLabel = (board: string) => SOURCE_NAMES[board.toLowerCase()] ?? `Source · ${board}`;
