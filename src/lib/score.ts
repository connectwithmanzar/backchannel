import type { Job, Market, RoleFamily } from "./collector/types";
import { countryToMarkets } from "./jobs/market";

export interface SearchProfile {
  name: string;
  targetFamilies: RoleFamily[];
  markets: Market[];
  tools: string[];
  minOteUsd: number;
  minOteByMarket?: Partial<Record<Market, number>>;
  prefersRemote: boolean;
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

  const score = Math.round(role * 0.3 + mkt * 0.2 + tools * 0.15 + pay * 0.2 + company * 0.15);
  const bits = [
    p.targetFamilies.includes(job.roleFamily) ? `${job.roleFamily} is one of your target role types` : `${job.roleFamily} is outside your target role types`,
    !p.markets.length ? `you haven't picked target markets yet` : p.markets.includes(job.market) ? `the location fits your markets` : `the location is outside your markets`,
    matchedTools.length ? `it mentions ${matchedTools.join(", ")}` : p.tools.length ? `it doesn't name your tools` : `you haven't added your tools yet`,
    payUsdMax === undefined ? `pay isn't published` : baseOnly ? `only base pay is published, so it can't be compared with your OTE minimum` : payUsdMax >= floor ? `pay is published and meets your minimum` : `pay is published but below your minimum`,
    ...(job.companyQuality !== undefined && job.companyQuality >= 70 ? [`the company is hiring broadly and shows its pay`] : job.companyQuality !== undefined && job.companyQuality <= 35 ? [`there is little hiring signal at this company`] : []),
  ];
  return {
    ...job,
    score,
    parts: [
      { label: "Role type", value: role },
      { label: "Market", value: mkt },
      { label: "Tools", value: tools },
      { label: "Pay", value: pay },
      { label: "Company", value: company },
    ],
    explanation: bits[0][0].toUpperCase() + bits.slice(0).join("; ").slice(1) + ".",
    matchedTools,
    payUsdMax,
  };
}
