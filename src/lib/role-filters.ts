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
