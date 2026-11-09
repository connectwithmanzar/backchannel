import type { Job, Market, RoleFamily } from "./collector/types";

export interface SearchProfile {
  name: string;
  targetFamilies: RoleFamily[];
  markets: Market[];
  tools: string[];
  minOteUsd: number;
  prefersRemote: boolean;
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
  const pay = payUsdMax === undefined ? 50 : payUsdMax >= p.minOteUsd ? 100 : 10;

  const score = Math.round(role * 0.35 + mkt * 0.25 + tools * 0.2 + pay * 0.2);
  const bits = [
    p.targetFamilies.includes(job.roleFamily) ? `${job.roleFamily} is one of your target role types` : `${job.roleFamily} is outside your target role types`,
    !p.markets.length ? `you haven't picked target markets yet` : p.markets.includes(job.market) ? `the location fits your markets` : `the location is outside your markets`,
    matchedTools.length ? `it mentions ${matchedTools.join(", ")}` : p.tools.length ? `it doesn't name your tools` : `you haven't added your tools yet`,
    payUsdMax === undefined ? `pay isn't published` : `pay is published`,
  ];
  return {
    ...job,
    score,
    parts: [
      { label: "Role type", value: role },
      { label: "Market", value: mkt },
      { label: "Tools", value: tools },
      { label: "Pay", value: pay },
    ],
    explanation: bits[0][0].toUpperCase() + bits.slice(0).join("; ").slice(1) + ".",
    matchedTools,
    payUsdMax,
  };
}
