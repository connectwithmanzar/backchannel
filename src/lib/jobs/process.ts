import { createHash } from "crypto";
import type { RawJob } from "@/lib/collectors/ats";
import { htmlToText } from "@/lib/collector/fetchers";

// ── Which titles count as the sales roles we target ─────────────────────────
export type Family = "SDR/BDR" | "GTM Engineer" | "Account Executive" | "Sales leadership";

const INCLUDE: [RegExp, Family][] = [
  [/\b(head of|director|vp|vice president|manager|lead),? (of )?(sales development|business development|sdr|bdr|outbound|inside sales)\b/i, "Sales leadership"],
  [/\b(sdr|bdr|sales development|business development rep(resentative)?|lead development|market development rep(resentative)?|inside sales|outbound (sales )?rep(resentative)?|revenue development|account development rep(resentative)?|adr)\b/i, "SDR/BDR"],
  [/\b(gtm|go[- ]to[- ]market) (engineer|engineering|systems|operations|automation)\b|\brevops engineer\b|\bgrowth engineer\b|\bsales (systems|automation) engineer\b/i, "GTM Engineer"],
  [/\b(account executive|\bae\b|new business (sales|manager|executive)|sales executive|business development (manager|executive)|founding (sales|ae))\b/i, "Account Executive"],
];
const EXCLUDE =
  /\b(intern(ship)?|software engineer|data engineer|recruit(er|ing)|talent acquisition|legal|counsel|accountant|accounting|payroll|solutions? engineer|sales engineer|support engineer|customer support|customer success|technical account manager|partner(ship)? marketing|product marketing)\b/i;

export function roleFamily(title: string): Family | null {
  if (EXCLUDE.test(title) && !/gtm engineer|growth engineer/i.test(title)) return null;
  for (const [re, fam] of INCLUDE) if (re.test(title)) return fam;
  return null;
}

export function isSalesRole(title: string): boolean {
  return roleFamily(title) !== null;
}

// ── Remote type ─────────────────────────────────────────────────────────────
export function detectRemoteType(location: string, remoteFlag?: boolean, description = ""): "remote" | "hybrid" | "onsite" | "unknown" {
  const l = location.toLowerCase();
  if (l.includes("hybrid") || /\bhybrid\b/i.test(description.slice(0, 2000))) return "hybrid";
  if (remoteFlag || l.includes("remote")) return "remote";
  if (location.trim()) return "onsite";
  return "unknown";
}

// ── Market (country label) ──────────────────────────────────────────────────
const MARKET_MAP: [RegExp, string][] = [
  [/\b(india|mumbai|bangalore|bengaluru|delhi|new delhi|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata|ahmedabad)\b/i, "India"],
  [/\b(uk|u\.k\.|united kingdom|england|scotland|london|manchester|edinburgh|bristol|leeds|cambridge, uk)\b/i, "UK"],
  [/\b(ireland|dublin|cork)\b/i, "Ireland"],
  [/\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|dach)\b/i, "Germany"],
  [/\b(netherlands|nederland|amsterdam|rotterdam|utrecht|eindhoven|benelux)\b/i, "Netherlands"],
  [/\b(france|paris|lyon|bordeaux)\b/i, "France"],
  [/\b(spain|madrid|barcelona)\b/i, "Spain"],
  [/\b(sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|nordics)\b/i, "Nordics"],
  [/\b(poland|warsaw|krakow|czech|prague|romania|bucharest|portugal|lisbon|italy|milan|switzerland|zurich|austria|vienna|belgium|brussels|estonia|tallinn)\b/i, "Europe"],
  [/\b(emea|europe)\b/i, "Europe"],
  [/\b(uae|dubai|abu dhabi|saudi|riyadh|qatar|doha)\b/i, "UAE"],
  [/\b(israel|tel aviv)\b/i, "Israel"],
  [/\b(singapore)\b/i, "Singapore"],
  [/\b(australia|sydney|melbourne|brisbane|new zealand|auckland)\b/i, "Australia"],
  [/\b(canada|toronto|vancouver|montreal)\b/i, "Canada"],
  [/\b(us|u\.s\.|usa|united states|new york|nyc|san francisco|bay area|austin|chicago|boston|seattle|denver|atlanta|los angeles|miami|dallas|north america|amer)\b/i, "US"],
  [/,\s?(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\b/, "US"],
  [/\b(apac|asia)\b/i, "APAC"],
];

export function detectMarket(location: string): string {
  for (const [re, market] of MARKET_MAP) if (re.test(location)) return market;
  if (/remote|anywhere|global|worldwide/i.test(location)) return "Remote";
  return location.trim() ? "Other" : "Unknown";
}

// ── Visa ────────────────────────────────────────────────────────────────────
export function detectVisa(description: string): "yes" | "no" | "unknown" {
  if (/(no|not|unable to|cannot|can't|won't|will not) (provide |offer )?(visa |work permit )?sponsor/i.test(description) ||
      /must (already )?(have|hold) (the )?(right|authori[sz]ation|eligibility) to work/i.test(description)) return "no";
  if (/(visa|relocation) (sponsorship|support) (is )?(available|provided|offered)|we (can |will |do )?sponsor|sponsorship available/i.test(description)) return "yes";
  return "unknown";
}

// ── Pay ─────────────────────────────────────────────────────────────────────
const CUR: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR", "₹": "INR", USD: "USD", GBP: "GBP", EUR: "EUR", INR: "INR", CAD: "CAD", AUD: "AUD", AED: "AED", SGD: "SGD" };

function toNum(s: string, unit?: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  const u = (unit ?? "").toLowerCase();
  if (u === "k") return n * 1e3;
  if (u === "m") return n * 1e6;
  if (u.startsWith("l")) return n * 1e5;
  return n;
}

export function parsePay(text: string): { currency?: string; min?: number; max?: number; isOte: boolean } {
  const re = /(USD|GBP|EUR|INR|CAD|AUD|AED|SGD|[$£€₹])\s?([\d][\d,.]*)\s?(k|m|l|lpa|lakhs?)?\s*(?:-|–|—|to)\s*(?:USD|GBP|EUR|INR|CAD|AUD|AED|SGD|[$£€₹])?\s?([\d][\d,.]*)\s?(k|m|l|lpa|lakhs?)?/i;
  const m = text.match(re);
  if (!m) return { isOte: false };
  const u2 = m[5] ?? m[3];
  const min = toNum(m[2], m[3] ?? u2);
  const max = toNum(m[4], u2);
  if (!(min >= 1000 && max >= min && max < 10_000_000_00)) return { isOte: false };
  const around = text.slice(Math.max(0, (m.index ?? 0) - 120), (m.index ?? 0) + m[0].length + 60);
  return { currency: CUR[m[1].toUpperCase()] ?? CUR[m[1]], min, max, isOte: /\bOTE\b|on[- ]target/i.test(around) };
}

export function dedupeHash(companyName: string, title: string, location: string): string {
  const str = [companyName, title, location].map((s) => s.toLowerCase().replace(/\s+/g, " ").trim()).join("|");
  return createHash("sha256").update(str).digest("hex");
}

export interface NormalisedJob {
  title: string;
  location: string;
  remote_type: "remote" | "hybrid" | "onsite" | "unknown";
  market: string;
  source_type: "careers";
  board: string;
  url: string;
  posted_at: string | null;
  description: string;
  currency: string | null;
  base_min: number | null;
  base_max: number | null;
  ote_min: number | null;
  ote_max: number | null;
  pay_band_status: "verified" | "estimated" | "unknown";
  visa_sponsorship: "yes" | "no" | "unknown";
  dedupe_hash: string;
}

export function normalise(raw: RawJob, companyName: string): NormalisedJob {
  const text = htmlToText(raw.description);
  let currency = raw.currency ?? null;
  let base_min = raw.base_min ?? null;
  let base_max = raw.base_max ?? null;
  let ote_min: number | null = null;
  let ote_max: number | null = null;
  let status: NormalisedJob["pay_band_status"] = "unknown";

  if (raw.pay_verified && (base_min || base_max)) {
    status = "verified";
  } else {
    const p = parsePay(text);
    if (p.min) {
      currency = p.currency ?? null;
      if (p.isOte) { ote_min = p.min; ote_max = p.max ?? null; } else { base_min = p.min; base_max = p.max ?? null; }
      status = "verified"; // published by the employer in the job post
    }
  }

  return {
    title: raw.title.trim(),
    location: raw.location || "Not stated",
    remote_type: detectRemoteType(raw.location, raw.remote, text),
    market: detectMarket(raw.location),
    source_type: "careers",
    board: raw.board,
    url: raw.url,
    posted_at: raw.posted_at,
    description: text.slice(0, 20000),
    currency,
    base_min,
    base_max,
    ote_min,
    ote_max,
    pay_band_status: status,
    visa_sponsorship: detectVisa(text),
    dedupe_hash: dedupeHash(companyName, raw.title, raw.location),
  };
}
