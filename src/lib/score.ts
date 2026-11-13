import type { Job, Market, RoleFamily } from "./collector/types";
import { countryToMarkets } from "./jobs/market";
import { seniorityOf, type Seniority } from "./role-filters";

export interface SearchProfile {
  name: string;
  targetFamilies: RoleFamily[];
  markets: Market[];
  tools: string[];
  minOteUsd: number;
  minOteByMarket?: Partial<Record<Market, number>>;
  prefersRemote: boolean;
  /** The levels you are aiming at, read from your target titles. Unset means no preference. */
  targetLevels?: Seniority[];
}

const FLOOR_MARKETS: Market[] = ["india", "remote-in", "emea", "us", "global"];

/** Reads the saved per-market minimums safely: only known markets, only positive numbers. */
export function parseMinOteByMarket(v: unknown): Partial<Record<Market, number>> {
  const out: Partial<Record<Market, number>> = {};
  if (!v || typeof v !== "object") return out;
  for (const m of FLOOR_MARKETS) {
    const n = Number((v as Record<string, unknown>)[m]);
    if (Number.isFinite(n) && n > 0) out[m] = n;
  }
  return out;
}

// Roles next to what you target (account management, partnerships, sales ops and customer success) rank above unrelated sales roles.
const ADJACENT = new Set<RoleFamily>(["Account management", "Partnerships", "Sales ops & CS"]);
const DEFAULT_FAMILIES: RoleFamily[] = ["SDR/BDR", "GTM Engineer", "Account Executive"];

/** The role types the user ticked on their profile ("Senior SDR", "Account Executive (SMB)"...). Empty means all three. */
export function familiesFromTitles(titles: string[] | null | undefined): RoleFamily[] {
  const out = new Set<RoleFamily>();
  for (const t of titles ?? []) {
    if (/\b(sdr|bdr)\b|sales development/i.test(t)) out.add("SDR/BDR");
    if (/account executive|\bae\b/i.test(t)) out.add("Account Executive");
    if (/\bgtm\b|go.to.market/i.test(t)) out.add("GTM Engineer");
    if (/\b(manager|head|director|vp)\b/i.test(t)) out.add("Sales leadership");
    if (/account manager|key account|client partner/i.test(t)) out.add("Account management");
    if (/partner|channel|alliance/i.test(t)) out.add("Partnerships");
    if (/operations|revops|enablement|customer success/i.test(t)) out.add("Sales ops & CS");
  }
  return out.size ? [...out] : DEFAULT_FAMILIES;
}

const LEVEL_ORDER: Seniority[] = ["entry", "mid", "senior", "lead"];
const DEFAULT_LEVELS: Seniority[] = ["entry", "mid", "senior"];

/** The levels your target titles point at ("Senior SDR" is senior, "Account Executive" is mid). Empty means everything below leadership. */
export function levelsFromTitles(titles: string[] | null | undefined): Seniority[] {
  const out = new Set<Seniority>((titles ?? []).filter((t) => t.trim()).map(seniorityOf));
  return out.size ? [...out] : DEFAULT_LEVELS;
}

/** 0 to 100: how well a role's level suits the levels you want. Leadership you did not ask for is a poor fit. */
export function levelFit(title: string, wanted: Seniority[] | undefined): number {
  if (!wanted || wanted.length === 0) return 70;
  const level = seniorityOf(title);
  if (wanted.includes(level)) return 100;
  if (level === "lead") return 20;
  const dist = Math.min(...wanted.map((w) => Math.abs(LEVEL_ORDER.indexOf(w) - LEVEL_ORDER.indexOf(level))));
  return dist <= 1 ? 55 : 25;
}

/** 0 to 100: newer postings first, since old ones are usually filled. An unknown date is neutral. */
export function freshnessFit(postedAt: string | undefined, now = Date.now()): number {
  if (!postedAt) return 60;
  const days = (now - Date.parse(postedAt)) / 864e5;
  if (!Number.isFinite(days)) return 60;
  if (days <= 3) return 100;
  if (days <= 14) return 85;
  if (days <= 30) return 60;
  if (days <= 60) return 35;
  return 15;
}

interface ProfileRow {
  name?: string | null; tools?: string[] | null; markets?: string[] | null; target_titles?: string[] | null;
  min_ote_usd?: number | null; min_ote_by_market?: unknown;
}

/** The one place a stored profile becomes a SearchProfile, so every screen and the daily job score the same way. */
export function buildSearchProfile(row: ProfileRow | null | undefined): SearchProfile {
  return {
    name: row?.name ?? "You",
    targetFamilies: familiesFromTitles(row?.target_titles),
    markets: [...new Set<Market>((row?.markets ?? []).flatMap(countryToMarkets))],
    tools: row?.tools ?? [],
    minOteUsd: row?.min_ote_usd ?? 0,
    minOteByMarket: parseMinOteByMarket(row?.min_ote_by_market),
    prefersRemote: false,
    targetLevels: levelsFromTitles(row?.target_titles),
  };
}

/** Whole-word match, so "Clay" does not match "Clayton". */
export function mentions(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(text);
}

export interface ScoredJob extends Job {
  score: number;
  parts: { label: string; value: number }[];
  explanation: string;
  /** The reasons it fits, and the things to watch, as separate short phrases. */
  reasons: string[];
  caveats: string[];
  matchedTools: string[];
  payUsdMax?: number;
}

// Rough conversion for comparing pay across currencies. Update occasionally.
export const FX_TO_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, INR: 1 / 84, CAD: 0.73, AUD: 0.66, AED: 0.272, SGD: 0.74 };

export function toUsd(amount?: number, currency?: string) {
  if (!amount || !currency || !FX_TO_USD[currency]) return undefined;
  return Math.round(amount * FX_TO_USD[currency]);
}

/**
 * First-pass fit score (0–100) without AI. Build 5 replaces this with
 * embeddings + an AI re-rank that writes a fuller explanation.
 */
export function scoreJob(job: Job, p: SearchProfile): ScoredJob {
  const role = p.targetFamilies.includes(job.roleFamily) ? 100 : job.roleFamily === "Sales leadership" ? 40 : ADJACENT.has(job.roleFamily) ? 50 : 20;
  const mkt = !p.markets.length ? 70 : p.markets.includes(job.market) ? (p.prefersRemote && job.remoteType === "remote" ? 100 : 85) : 25;
  const text = `${job.title} ${job.description}`;
  const matchedTools = p.tools.filter((t) => mentions(text, t));
  const tools = matchedTools.length ? Math.min(100, 50 + matchedTools.length * 20) : 40;
  const payUsdMax = toUsd(job.payMax, job.currency);
  const floor = p.minOteByMarket?.[job.market] ?? p.minOteUsd;
  // A base salary cannot be compared with an OTE minimum, so base-only pay counts as unknown.
  const baseOnly = job.payKind === "base";
  const pay = payUsdMax === undefined || baseOnly ? 50 : payUsdMax >= floor ? 100 : 10;
  const company = job.companyQuality ?? 50;

  const level = levelFit(job.title, p.targetLevels);
  const fresh = freshnessFit(job.postedAt);

  const score = Math.round(role * 0.26 + level * 0.12 + mkt * 0.17 + tools * 0.12 + pay * 0.15 + company * 0.1 + fresh * 0.08);
  const reasons = [
    p.targetFamilies.includes(job.roleFamily) ? `${job.roleFamily} is one of your target role types` : null,
    matchedTools.length ? `it mentions ${matchedTools.join(", ")}` : null,
    level === 100 && p.targetLevels ? `the level matches what you are aiming for` : null,
    p.markets.length && p.markets.includes(job.market) ? `the location fits your markets` : null,
    payUsdMax !== undefined && !baseOnly && payUsdMax >= floor ? `pay is published and meets your minimum` : null,
    job.companyQuality !== undefined && job.companyQuality >= 70 ? `the company is hiring broadly and shows its pay` : null,
    fresh >= 85 ? `it was posted recently` : null,
  ].filter((x): x is string => !!x);
  const caveats = [
    !p.targetFamilies.includes(job.roleFamily) ? `${job.roleFamily} is outside your target role types` : null,
    level <= 25 ? `the level looks ${seniorityOf(job.title) === "lead" ? "like leadership, above" : "far from"} what you are aiming for` : null,
    p.markets.length && !p.markets.includes(job.market) ? `the location is outside your markets` : null,
    p.tools.length && !matchedTools.length ? `it doesn't name your tools` : null,
    payUsdMax !== undefined && !baseOnly && payUsdMax < floor ? `pay is published but below your minimum` : null,
    payUsdMax === undefined ? `pay isn't published` : baseOnly ? `only base pay is published, so it can't be compared with your OTE minimum` : null,
    job.companyQuality !== undefined && job.companyQuality <= 35 ? `there is little hiring signal at this company` : null,
    fresh <= 35 ? `the posting is old and may already be filled` : null,
  ].filter((x): x is string => !!x);
  const sentence = (parts: string[]) => parts.join("; ");
  const lead = reasons.length ? sentence(reasons.slice(0, 4)) : `nothing stands out for you yet`;
  const explanation = lead[0].toUpperCase() + lead.slice(1) + "." + (caveats.length ? ` Watch out: ${sentence(caveats.slice(0, 2))}.` : "");
  return {
    ...job,
    score,
    parts: [
      { label: "Role type", value: role },
      { label: "Market", value: mkt },
      { label: "Tools", value: tools },
      { label: "Pay", value: pay },
      { label: "Company", value: company },
      { label: "Level", value: level },
      { label: "Freshness", value: fresh },
    ],
    explanation,
    reasons,
    caveats,
    matchedTools,
    payUsdMax,
  };
}
