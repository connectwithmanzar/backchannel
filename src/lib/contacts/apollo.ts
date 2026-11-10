// Apollo people search. Search costs no credits and returns only a first name, a hidden last name,
// a title and whether an email exists. A "reveal" (bulk_match) adds the full name and LinkedIn link
// and may use credits, so it is opt-in and capped. We never ask for emails or phone numbers.
const BASE = "https://api.apollo.io/api/v1";

export type PersonRole = "hiring_manager" | "recruiter" | "other";

export interface FoundPerson {
  id: string;
  firstName: string;
  lastHint: string; // e.g. "Va***z"
  title: string;
  company: string;
  hasEmail: boolean;
  role: PersonRole;
}

export interface RevealedPerson { id: string; name: string; title: string; linkedinUrl: string | null }

export const HIRING_TITLES = [
  "head of sales", "vp sales", "vice president sales", "director of sales", "sales development manager", "head of sdr",
  "director of revenue", "head of revenue", "sales manager", "head of business development",
];
export const RECRUITER_TITLES = ["recruiter", "talent acquisition", "head of talent"];
export const MIN_HIRING_PEOPLE = 5; // below this, a second search adds recruiters
export const MAX_PEOPLE = 15;

export function apolloConfigured(): boolean {
  return (process.env.APOLLO_API_KEY ?? "").length > 10;
}

/** Accepts "acme.com", "https://www.acme.com/careers" and returns "acme.com", or null if it isn't a plain domain. */
export function cleanDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : null;
}

export function classifyTitle(title: string): PersonRole {
  const t = title.toLowerCase();
  if (/\b(recruit\w*|talent|people partner|hr)\b/.test(t)) return "recruiter";
  if (/\b(sales|sdr|bdr|revenue|business development|growth|gtm)\b/.test(t)) return "hiring_manager";
  return "other";
}

export type PeopleKind = "hiring" | "recruiter" | "both";

/** "Dubai, Bengaluru" becomes ["Dubai", "Bengaluru"]; at most five places, each trimmed. */
export function parseLocations(raw: string): string[] {
  return raw.split(/[,;]/).map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 5);
}

/** Same search with different filters must not reuse each other's saved result. */
export function searchCacheKey(domain: string, locations: string[], kind: PeopleKind): string {
  return [domain, locations.map((l) => l.toLowerCase()).sort().join("+"), kind].join("|");
}

export function buildSearchUrl(domain: string, titles: string[] = HIRING_TITLES, locations: string[] = []): string {
  const p = new URLSearchParams();
  p.append("q_organization_domains_list[]", domain);
  for (const l of locations) p.append("person_locations[]", l);
  for (const t of titles) p.append("person_titles[]", t);
  p.append("include_similar_titles", "true");
  p.append("per_page", "15");
  return `${BASE}/mixed_people/api_search?${p.toString()}`;
}

type ApolloPerson = { id?: string; first_name?: string; last_name_obfuscated?: string; title?: string; has_email?: boolean; organization?: { name?: string } };

export function parsePeople(json: unknown, fallbackCompany: string): FoundPerson[] {
  const people = (json as { people?: ApolloPerson[] } | null)?.people;
  if (!Array.isArray(people)) return [];
  return people
    .filter((p): p is ApolloPerson & { id: string } => typeof p?.id === "string" && !!p.first_name)
    .map((p) => ({
      id: p.id,
      firstName: p.first_name ?? "",
      lastHint: p.last_name_obfuscated ?? "",
      title: p.title ?? "",
      company: p.organization?.name ?? fallbackCompany,
      hasEmail: p.has_email === true,
      role: classifyTitle(p.title ?? ""),
    }))
    .sort((a, b) => Number(a.role === "other") - Number(b.role === "other"));
}

export class ApolloError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init, signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": process.env.APOLLO_API_KEY ?? "" },
  });
  if (res.status === 429) throw new ApolloError("Apollo's hourly limit was reached. Try again in a while.", 429);
  if (res.status === 401 || res.status === 403) throw new ApolloError("Apollo refused the key. Check APOLLO_API_KEY and that the account is eligible for API use.", res.status);
  if (!res.ok) throw new ApolloError(`Apollo returned an error (${res.status}).`, res.status);
  return res.json();
}

/** Hiring-side people first (they are the best referral asks); recruiters only fill the gap. */
export function mergePeople(first: FoundPerson[], second: FoundPerson[], limit = MAX_PEOPLE): FoundPerson[] {
  const seen = new Set<string>();
  return [...first, ...second].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, limit);
}

export async function searchPeople(domain: string, companyName: string, opts: { locations?: string[]; kind?: PeopleKind } = {}): Promise<FoundPerson[]> {
  const locations = opts.locations ?? [];
  const kind = opts.kind ?? "both";
  const run = async (titles: string[]) => parsePeople(await call(buildSearchUrl(domain, titles, locations), { method: "POST" }), companyName);
  if (kind === "recruiter") return mergePeople(await run(RECRUITER_TITLES), []);
  const hiring = await run(HIRING_TITLES);
  if (kind === "hiring" || hiring.length >= MIN_HIRING_PEOPLE) return mergePeople(hiring, []);
  return mergePeople(hiring, await run(RECRUITER_TITLES));
}

/** Full name and LinkedIn link for one person. May use Apollo credits; never requests email or phone. */
export async function revealPerson(id: string): Promise<RevealedPerson | null> {
  const url = `${BASE}/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false`;
  const json = (await call(url, { method: "POST", body: JSON.stringify({ details: [{ id }] }) })) as {
    matches?: { id?: string; name?: string; first_name?: string; last_name?: string; title?: string; linkedin_url?: string | null }[];
  };
  const m = json.matches?.[0];
  if (!m) return null;
  const name = m.name ?? [m.first_name, m.last_name].filter(Boolean).join(" ");
  return { id, name, title: m.title ?? "", linkedinUrl: m.linkedin_url ?? null };
}
