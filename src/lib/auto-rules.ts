// Your own limits for automatic applying. Pure functions, so they are tested without a database.
// They apply to every automatic route: one-tap apply, the robot queue and batch sending.

export interface AutoRules {
  /** 0 means no minimum. Otherwise a role scoring lower for you is not sent automatically. */
  minScore: number;
  /** Yearly pay floor in lakh rupees (LPA). 0 means no floor. Only checked when the posting states a yearly INR figure. */
  minPayLpa: number;
  blockedCompanies: string[];
  pauseWeekends: boolean;
}

export const DEFAULT_RULES: AutoRules = { minScore: 0, minPayLpa: 0, blockedCompanies: [], pauseWeekends: false };

const num = (v: unknown, lo: number, hi: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

/** Anything stored or posted becomes a valid rule set. Unknown or broken input falls back to "no limit". */
export function cleanRules(v: unknown): AutoRules {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const list = Array.isArray(o.blockedCompanies) ? o.blockedCompanies : typeof o.blockedCompanies === "string" ? o.blockedCompanies.split(/[\n,]/) : [];
  const blocked = [...new Set(list.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200);
  return { minScore: Math.round(num(o.minScore, 0, 100)), minPayLpa: num(o.minPayLpa, 0, 500), blockedCompanies: blocked, pauseWeekends: o.pauseWeekends === true };
}

export interface JobFacts { company: string; score: number | null; payMax: number | null; currency: string | null }
export type RuleCheck = { ok: true } | { ok: false; reason: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** True on Saturday and Sunday in India, where the daily check runs. */
export function isWeekendIst(now: Date): boolean {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }).format(now);
  return day === "Sat" || day === "Sun";
}

export function checkRules(job: JobFacts, rules: AutoRules, now = new Date()): RuleCheck {
  if (rules.pauseWeekends && isWeekendIst(now)) return { ok: false, reason: "Auto-apply is paused on weekends (your setting). It will send on Monday." };
  const company = norm(job.company);
  if (company && rules.blockedCompanies.some((b) => { const n = norm(b); return n.length > 0 && (company === n || company.includes(` ${n} `) || company.startsWith(`${n} `) || company.endsWith(` ${n}`)); })) {
    return { ok: false, reason: `${job.company} is on your blocked list.` };
  }
  if (rules.minScore > 0 && job.score !== null && job.score < rules.minScore) {
    return { ok: false, reason: `This role scores ${job.score} for you, below your minimum of ${rules.minScore}.` };
  }
  if (rules.minPayLpa > 0 && job.currency === "INR" && job.payMax && job.payMax > 0 && job.payMax < rules.minPayLpa * 100000) {
    return { ok: false, reason: `The stated pay is below your floor of ${rules.minPayLpa} LPA.` };
  }
  return { ok: true };
}
