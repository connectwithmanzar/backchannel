import { createHash } from "crypto";
import type { RawJob } from "@/lib/collectors/ats";
import { htmlToText } from "@/lib/collector/fetchers";
import { detectMarket } from "./location";

// ── Which titles count as the sales roles we target ─────────────────────────
export type Family = "SDR/BDR" | "GTM Engineer" | "Account Executive" | "Sales leadership" | "Account management" | "Partnerships" | "Sales ops & CS";

const INCLUDE: [RegExp, Family][] = [
  [/\b(head of|director|vp|vice president|manager|lead),? (of )?(sales development|business development|sdr|bdr|outbound|inside sales)\b/i, "Sales leadership"],
  [/\b(sdr|bdr|sales development|business development rep(resentative)?|lead development|market development rep(resentative)?|inside sales|outbound (sales )?rep(resentative)?|revenue development|account development rep(resentative)?|adr)\b/i, "SDR/BDR"],
  [/\b(gtm|go[- ]to[- ]market) (engineer|engineering|systems|operations|automation)\b|\brevops engineer\b|\bgrowth engineer\b|\bsales (systems|automation) engineer\b/i, "GTM Engineer"],
  [/\b(account executive|\bae\b|new business (sales|manager|executive)|sales executive|business development (manager|executive)|founding (sales|ae))\b/i, "Account Executive"],
  [/\b(partner(ship)?s? (manager|executive|lead|director|development)|channel (sales|manager|partner)|alliances? (manager|lead|director))\b/i, "Partnerships"],
  [/\b(account manager|key account|client partner|strategic account|major account|relationship manager)\b/i, "Account management"],
  [/\b(sales manager|sales team lead|sales lead|regional sales (manager|director)|area sales manager|country manager|team lead.{0,12}(sales|sdr|bdr))\b/i, "Sales leadership"],
  [/\b(sales operations|revenue operations|revops|sales enablement|sales analyst|customer success (manager|executive|associate|specialist|lead)|client success|onboarding (manager|specialist))\b/i, "Sales ops & CS"],
];
const EXCLUDE =
  /\b(intern(ship)?|software engineer|data engineer|recruit(er|ing)|talent acquisition|legal|counsel|accountant|accounting|payroll|solutions? engineer|sales engineer|support engineer|customer support|customer success engineer|technical account manager|partner(ship)? marketing|product marketing)\b/i;

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
// The place rules live in ./location so screens can use them too.
export { detectMarket };

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
  source_type: "careers" | "public";
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
