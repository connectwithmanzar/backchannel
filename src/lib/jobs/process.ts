import { createHash } from "crypto";
import type { RawJob } from "@/lib/collectors/ats";

// ── Sales-role keyword filter ───────────────────────────────────────────────
const SALES_KEYWORDS = [
  "sdr", "bdr", "sales development", "business development",
  "account executive", " ae ", "gtm engineer", "gtm ",
  "inside sales", "partnerships manager", "growth engineer",
  "account manager", "revenue development",
  "outbound sales", "demand generation",
  "sales engineer",
];

export function isSalesRole(title: string): boolean {
  const lower = ` ${title.toLowerCase()} `;
  return SALES_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Remote-type detector ───────────────────────────────────────────────────
export function detectRemoteType(
  location: string
): "remote" | "hybrid" | "onsite" | "unknown" {
  const l = location.toLowerCase();
  if (l.includes("remote") && !l.includes("hybrid")) return "remote";
  if (l.includes("hybrid")) return "hybrid";
  if (location.trim().length > 0) return "onsite";
  return "unknown";
}

// ── Market mapper ──────────────────────────────────────────────────────────
const MARKET_MAP: [RegExp, string][] = [
  [/remote/i, "Remote"],
  [/india|mumbai|bangalore|bengaluru|delhi|hyderabad|pune|chennai|kolkata/i, "India"],
  [/uk|united kingdom|england|london|manchester|edinburgh/i, "UK"],
  [/germany|deutschland|berlin|munich|hamburg|frankfurt/i, "Germany"],
  [/netherlands|nederland|amsterdam|rotterdam|eindhoven/i, "Netherlands"],
  [/france|paris|lyon|bordeaux/i, "France"],
  [/ireland|dublin|cork/i, "Ireland"],
  [/singapore/i, "Singapore"],
  [/uae|dubai|abu dhabi/i, "UAE"],
  [/canada|toronto|vancouver|montreal/i, "Canada"],
  [/australia|sydney|melbourne|brisbane/i, "Australia"],
  [/us|usa|united states|new york|san francisco|austin|chicago|boston|seattle|remote.*us/i, "US"],
];

export function detectMarket(location: string): string {
  for (const [re, market] of MARKET_MAP) {
    if (re.test(location)) return market;
  }
  return location.trim() ? "Other" : "Unknown";
}

// ── Visa sponsorship hint ──────────────────────────────────────────────────
export function detectVisa(description: string): "yes" | "no" | "unknown" {
  const d = description.toLowerCase();
  if (/visa sponsorship (is )?available|we (do |will )?sponsor/i.test(d)) return "yes";
  if (/no visa|not able to sponsor|unable to sponsor|must (already )?have (the )?right to work/i.test(d)) return "no";
  return "unknown";
}

// ── Pay parser (regex fallback when ATS doesn't provide structured pay) ─────
const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR", "₹": "INR" };

export function parsePay(description: string): {
  currency?: string;
  base_min?: number;
  base_max?: number;
  ote_min?: number;
  ote_max?: number;
} {
  // Look for a pattern like $80,000 - $100,000 or £50k - £70k
  const rangeRe = /([$£€₹])([\d,]+)k?\s*[-–—]\s*[$£€₹]?([\d,]+)k?/g;
  const oTERe = /ote[:\s]+[$£€₹]?([\d,]+)k?\s*[-–—]\s*[$£€₹]?([\d,]+)k?/i;
  const matches = [...description.matchAll(rangeRe)];
  if (!matches.length) return {};

  const symbol = matches[0][1];
  const currency = CURRENCY_SYMBOLS[symbol] ?? "USD";
  const toNum = (s: string, unit: string) => {
    const n = Number(s.replace(/,/g, ""));
    return unit === "k" ? n * 1000 : n > 500 ? n : n * 1000;
  };

  const oTEMatch = oTERe.exec(description);
  if (oTEMatch) {
    return {
      currency,
      ote_min: Number(oTEMatch[1].replace(/,/g, "")) > 500 ? Number(oTEMatch[1].replace(/,/g, "")) : Number(oTEMatch[1].replace(/,/g, "")) * 1000,
      ote_max: Number(oTEMatch[2].replace(/,/g, "")) > 500 ? Number(oTEMatch[2].replace(/,/g, "")) : Number(oTEMatch[2].replace(/,/g, "")) * 1000,
    };
  }

  const unit = matches[0][0].toLowerCase().includes("k") ? "k" : "";
  return {
    currency,
    base_min: toNum(matches[0][2], unit),
    base_max: toNum(matches[0][3], unit),
  };
}

// ── Dedupe hash ────────────────────────────────────────────────────────────
export function dedupeHash(
  companyName: string,
  title: string,
  location: string
): string {
  const str = [companyName, title, location]
    .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
  return createHash("sha256").update(str).digest("hex");
}

// ── Normalise a RawJob into DB-ready shape ─────────────────────────────────
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
  currency?: string;
  base_min?: number;
  base_max?: number;
  ote_min?: number;
  ote_max?: number;
  pay_band_status: "verified" | "estimated" | "unknown";
  visa_sponsorship: "yes" | "no" | "unknown";
  dedupe_hash: string;
}

export function normalise(raw: RawJob, companyName: string): NormalisedJob {
  const remoteType = detectRemoteType(raw.location);
  const market = detectMarket(raw.location);
  const visa = detectVisa(raw.description);

  let currency = raw.currency;
  let base_min = raw.base_min;
  let base_max = raw.base_max;
  let ote_min = raw.ote_min;
  let ote_max = raw.ote_max;
  let payStatus: "verified" | "estimated" | "unknown" = "unknown";

  if (raw.pay_verified && (base_min || ote_min)) {
    payStatus = "verified";
  } else {
    const parsed = parsePay(raw.description);
    if (parsed.base_min || parsed.ote_min) {
      currency = currency ?? parsed.currency;
      base_min = base_min ?? parsed.base_min;
      base_max = base_max ?? parsed.base_max;
      ote_min = ote_min ?? parsed.ote_min;
      ote_max = ote_max ?? parsed.ote_max;
      payStatus = "estimated";
    }
  }

  return {
    title: raw.title,
    location: raw.location,
    remote_type: remoteType,
    market,
    source_type: "careers",
    board: raw.board,
    url: raw.url,
    posted_at: raw.posted_at,
    description: raw.description.slice(0, 20000), // cap description length
    currency,
    base_min,
    base_max,
    ote_min,
    ote_max,
    pay_band_status: payStatus,
    visa_sponsorship: visa,
    dedupe_hash: dedupeHash(companyName, raw.title, raw.location),
  };
}
