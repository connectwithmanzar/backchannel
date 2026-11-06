import { createHash } from "node:crypto";
import type { Job, Market, RawJob, RemoteType, RoleFamily } from "./types";

// ---- Which jobs are sales roles we care about ----
const INCLUDE: [RegExp, RoleFamily][] = [
  [/\b(head of|director|vp|vice president|manager),? (of )?(sales development|business development|sdr|bdr|outbound)\b/i, "Sales leadership"],
  [/\b(sdr|bdr|sales development|business development rep|business development representative|lead development|market development rep|inside sales)\b/i, "SDR/BDR"],
  [/\b(gtm|go[- ]to[- ]market) (engineer|engineering|systems|operations)\b|\brevops engineer\b|\bgrowth engineer\b/i, "GTM Engineer"],
  [/\b(account executive|\bae\b|account manager, new business|new business (sales|manager)|sales executive)\b/i, "Account Executive"],
];
const EXCLUDE = /\b(intern(ship)?|software engineer|data engineer|recruit(er|ing)|legal|counsel|accountant|accounting|payroll|solutions engineer|sales engineer|support engineer|customer support|technical account manager)\b/i;

export function roleFamily(title: string): RoleFamily | null {
  if (EXCLUDE.test(title) && !/gtm engineer/i.test(title)) return null;
  for (const [re, fam] of INCLUDE) if (re.test(title)) return fam;
  return null;
}

// ---- Location → market + remote type ----
const INDIA = /\b(india|bangalore|bengaluru|mumbai|pune|gurgaon|gurugram|delhi|noida|hyderabad|chennai|kolkata|ahmedabad)\b/i;
const EMEA = /\b(uk|united kingdom|england|london|manchester|ireland|dublin|germany|berlin|munich|münchen|hamburg|frankfurt|netherlands|amsterdam|rotterdam|france|paris|spain|madrid|barcelona|portugal|lisbon|italy|milan|sweden|stockholm|denmark|copenhagen|poland|warsaw|switzerland|zurich|belgium|brussels|austria|vienna|emea|europe|uae|dubai|abu dhabi|saudi|riyadh|israel|tel aviv)\b/i;
const US = /\b(united states|usa|u\.s\.|new york|nyc|san francisco|seattle|austin|boston|chicago|denver|los angeles|atlanta|miami|toronto|canada|vancouver|north america)\b/i;
const US_STATE = /,\s?(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\b/;

export function remoteType(loc: string, flag?: boolean, desc = ""): RemoteType {
  if (flag || /\bremote\b/i.test(loc)) return "remote";
  if (/\bhybrid\b/i.test(loc) || /\bhybrid\b/i.test(desc.slice(0, 1500))) return "hybrid";
  if (loc.trim()) return "onsite";
  return "unknown";
}

export function market(loc: string, remote: RemoteType): Market {
  if (INDIA.test(loc)) return remote === "remote" ? "remote-in" : "india";
  if (EMEA.test(loc)) return "emea";
  if (US.test(loc) || US_STATE.test(loc)) return "us";
  if (remote === "remote") return "global";
  return "global";
}

// ---- Pay ----
const CUR: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR", "₹": "INR", USD: "USD", GBP: "GBP", EUR: "EUR", INR: "INR", CAD: "CAD", AUD: "AUD", AED: "AED" };

function toNum(s: string, k?: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  if (!k) return n;
  const m = k.toLowerCase();
  if (m === "k") return n * 1e3;
  if (m === "m") return n * 1e6;
  if (m === "l" || m === "lpa" || m === "lakh" || m === "lakhs") return n * 1e5;
  return n;
}

/** Finds a pay range like "$80,000 - $110,000", "€55K – €70K", "USD 90000-120000" or "₹12L - ₹18L". */
export function parsePay(text = ""): { currency?: string; min?: number; max?: number } {
  const re = /(USD|GBP|EUR|INR|CAD|AUD|AED|[$£€₹])\s?([\d][\d,.]*)\s?(k|m|l|lpa|lakhs?)?\s*(?:-|–|—|to)\s*(?:USD|GBP|EUR|INR|CAD|AUD|AED|[$£€₹])?\s?([\d][\d,.]*)\s?(k|m|l|lpa|lakhs?)?/i;
  const m = text.match(re);
  if (!m) return {};
  const unit2 = m[5] ?? m[3];
  const min = toNum(m[2], m[3] ?? unit2);
  const max = toNum(m[4], unit2);
  if (!(min > 1000 && max >= min)) return {};
  return { currency: CUR[m[1].toUpperCase()] ?? CUR[m[1]], min, max };
}

export function visa(desc = ""): "yes" | "no" | "unknown" {
  if (/(no|not|unable to|cannot|can't) (provide |offer )?(visa )?sponsor/i.test(desc) || /must (already )?(have|hold) (the )?(right|authori[sz]ation) to work/i.test(desc)) return "no";
  if (/(visa|relocation) (sponsorship|support) (is )?(available|provided|offered)|we (can |will )?sponsor/i.test(desc)) return "yes";
  return "unknown";
}

export function dedupeHash(company: string, title: string, location: string): string {
  return createHash("sha256").update(`${company.toLowerCase().trim()}|${title.toLowerCase().trim()}|${location.toLowerCase().trim()}`).digest("hex").slice(0, 32);
}

export function normalize(raw: RawJob, now = new Date()): Job | null {
  const fam = roleFamily(raw.title);
  if (!fam) return null;
  const desc = raw.description ?? "";
  const rt = remoteType(raw.location, raw.remoteFlag, desc);
  const pay = parsePay(raw.compensationText ?? "") ;
  const payFromDesc = pay.min ? pay : parsePay(desc);
  return {
    id: dedupeHash(raw.company, raw.title, raw.location),
    company: raw.company,
    title: raw.title.trim(),
    location: raw.location || "Not stated",
    remoteType: rt,
    market: market(raw.location, rt),
    sourceType: "careers",
    board: raw.ats,
    url: raw.url,
    postedAt: raw.postedAt,
    lastCheckedAt: now.toISOString(),
    currency: payFromDesc.currency,
    payMin: payFromDesc.min,
    payMax: payFromDesc.max,
    payBandStatus: payFromDesc.min ? "verified" : "unknown",
    visaSponsorship: visa(desc),
    roleFamily: fam,
    description: desc.slice(0, 6000),
  };
}

export function dedupe(jobs: Job[]): Job[] {
  const seen = new Map<string, Job>();
  for (const j of jobs) if (!seen.has(j.id)) seen.set(j.id, j);
  return [...seen.values()];
}
