import type { Job, Market, RoleFamily } from "./collector/types";

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

export interface ScoredJob extends Job {
  score: number;
  parts: { label: string; value: number }[];
  explanation: string;
  matchedTools: string[];
  payUsdMax?: number;
}

// Rough conversion for comparing pay across currencies. Update occasionally.
export const FX_TO_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, INR: 1 / 84, CAD: 0.73, AUD: 0.66, AED: 0.272 };

export function toUsd(amount?: number, currency?: string) {
  if (!amount || !currency || !FX_TO_USD[currency]) return undefined;
  return Math.round(amount * FX_TO_USD[currency]);
}

/**
 * First-pass fit score (0–100) without AI. Build 5 replaces this with
 * embeddings + an AI re-rank that writes a fuller explanation.
 */
export function scoreJob(job: Job, p: SearchProfile): ScoredJob {
  const role = p.targetFamilies.includes(job.roleFamily) ? 100 : job.roleFamily === "Sales leadership" ? 40 : 20;
  const mkt = !p.markets.length ? 70 : p.markets.includes(job.market) ? (p.prefersRemote && job.remoteType === "remote" ? 100 : 85) : 25;
  const text = `${job.title} ${job.description}`.toLowerCase();
  const matchedTools = p.tools.filter((t) => text.includes(t.toLowerCase()));
  const tools = matchedTools.length ? Math.min(100, 50 + matchedTools.length * 20) : 40;
  const payUsdMax = toUsd(job.payMax, job.currency);
  const floor = p.minOteByMarket?.[job.market] ?? p.minOteUsd;
  const pay = payUsdMax === undefined ? 50 : payUsdMax >= floor ? 100 : 10;
  const company = job.companyQuality ?? 50;

  const score = Math.round(role * 0.3 + mkt * 0.2 + tools * 0.15 + pay * 0.2 + company * 0.15);
  const bits = [
    p.targetFamilies.includes(job.roleFamily) ? `${job.roleFamily} is one of your target role types` : `${job.roleFamily} is outside your target role types`,
    !p.markets.length ? `you haven't picked target markets yet` : p.markets.includes(job.market) ? `the location fits your markets` : `the location is outside your markets`,
    matchedTools.length ? `it mentions ${matchedTools.join(", ")}` : p.tools.length ? `it doesn't name your tools` : `you haven't added your tools yet`,
    payUsdMax === undefined ? `pay isn't published` : payUsdMax >= floor ? `pay is published and meets your minimum` : `pay is published but below your minimum`,
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
