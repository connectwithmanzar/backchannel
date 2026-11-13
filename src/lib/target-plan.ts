// The plan for a role on the Target list: which steps to do, in what order, and how far along it is. Pure functions.

export const STEP_KEYS = ["research", "referral", "email", "linkedin", "apply"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STRATEGIES = ["referral_first", "outreach_first", "apply_now"] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABEL: Record<Strategy, { name: string; blurb: string }> = {
  referral_first: { name: "Referral first", blurb: "Research, ask someone for a referral, warm up the hiring team, then apply." },
  outreach_first: { name: "Direct outreach", blurb: "No referral to ask? Email and message the hiring team first, then apply." },
  apply_now: { name: "Apply now", blurb: "Apply straight away, then follow up by email and LinkedIn." },
};

export const STEP_INFO: Record<StepKey, { title: string; how: string }> = {
  research: { title: "Research the company and role", how: "Read the job, the company's news and what the team does. Note one specific thing to mention." },
  referral: { title: "Ask for a referral", how: "Mutual connections first, then people in similar roles, then sales leaders and recruiters." },
  email: { title: "Email the hiring team", how: "A short, specific note to the hiring manager or a recruiter. Send it from Backchannel so replies show up." },
  linkedin: { title: "Connect on LinkedIn", how: "Send a connection request with a one-line note to the hiring manager or someone on the team." },
  apply: { title: "Apply", how: "Send the application once the groundwork is done." },
};

const ORDER: Record<Strategy, StepKey[]> = {
  referral_first: ["research", "referral", "linkedin", "email", "apply"],
  outreach_first: ["research", "email", "linkedin", "apply"],
  apply_now: ["apply", "linkedin", "email"],
};

export const stepsFor = (strategy: Strategy): StepKey[] => ORDER[strategy];

export const cleanStrategy = (v: unknown): Strategy => ((STRATEGIES as readonly string[]).includes(String(v)) ? (v as Strategy) : "referral_first");
export const isStepKey = (v: unknown): v is StepKey => (STEP_KEYS as readonly string[]).includes(String(v));

/** Stored steps become a clean map of known steps to true/false. */
export function cleanSteps(v: unknown): Record<StepKey, boolean> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(STEP_KEYS.map((k) => [k, o[k] === true])) as Record<StepKey, boolean>;
}

export interface PlanView {
  steps: { key: StepKey; title: string; how: string; done: boolean }[];
  done: number;
  total: number;
  percent: number;
  next: StepKey | null;
  /** True when every step before "apply" is done, so applying is the one thing left. */
  readyToApply: boolean;
}

export function planOf(strategy: Strategy, stored: unknown): PlanView {
  const done = cleanSteps(stored);
  const keys = stepsFor(strategy);
  const steps = keys.map((key) => ({ key, ...STEP_INFO[key], done: done[key] }));
  const finished = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key ?? null;
  const before = steps.filter((s) => s.key !== "apply");
  const applyIndex = keys.indexOf("apply");
  return {
    steps, done: finished, total: steps.length, percent: Math.round((finished / steps.length) * 100), next,
    readyToApply: strategy !== "apply_now" && applyIndex === keys.length - 1 && before.every((s) => s.done) && !done.apply,
  };
}
