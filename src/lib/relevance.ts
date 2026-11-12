// Which roles are relevant to the owner: individual-contributor SDR/BDR, GTM and associate or mid-level Account Executive
// roles at B2B companies. Heads, VPs, directors and managers, senior or enterprise AEs, and consumer-facing sales are not.
// The rule reads only the title, the company name and, for the consumer check, the start of the description.

export type RelevantKind = "SDR/BDR" | "GTM" | "Account Executive";

export interface Relevance { relevant: boolean; kind: RelevantKind | null; reason: string }

const LEADERSHIP = /\b(head|vp|vice president|avp|director|chief|cro|president|general manager|gm|manager|managing|team lead|lead,|principal|staff)\b/i;
const SENIOR_AE = /\b(senior|sr\.?|enterprise|strategic|global|major|key|principal|staff|lead|executive director|national)\b/i;

const SDR = /\b(sdr|bdr|adr|sales development|business development (rep|representative|executive|associate|specialist|analyst|officer)|lead (generation|development|gen)|market development|account development|inside sales|outbound sales|outbound (rep|representative)|demand generation (rep|representative|executive|associate)|appointment setter|sales outreach|pipeline generation)\b/i;
const GTM = /\b((gtm|go[- ]to[- ]market) (engineer|engineering|operations|ops|specialist|analyst|associate|automation|systems|strategist)|revenue operations (specialist|analyst|associate|coordinator|engineer)|revops (engineer|specialist|analyst)|growth engineer|sales (operations|ops) (specialist|analyst|associate))\b/i;
const AE = /\b(account executive|ae)\b/i;

// Consumer-facing or field selling, which is not what he is looking for. Checked on the title and company name.
const CONSUMER_TITLE = /\b(personal loans?|home loans?|loans?|insurance|credit card|mutual fund|demat|trading|real estate|property|dsa|telecaller|tele[- ]?calling|tele[- ]?sales|field (sales|executive)|retail|branch|walk[- ]?in|store|showroom|hospitality|hotel|gym|fitness|salon|spa|counsel+or|admission|academic|collections?|recovery|banking|bank|relationship manager|channel sales|distributor|fmcg|pharma rep|medical rep|driver|delivery)\b/i;
const CONSUMER_COMPANY = /\b(bank|insurance|assurance|finance ltd|housing finance|realty|properties|hotels?|resorts?|hospital|clinic|school|college|university)\b/i;

/** True when the description says it is selling to consumers and never mentions businesses. */
function consumerDescription(description: string): boolean {
  const d = description.slice(0, 1500).toLowerCase();
  return /\bb2c\b|direct to consumer|walk-?in customers|door[- ]to[- ]door/.test(d) && !/\bb2b\b|\bsaas\b|enterprise customers/.test(d);
}

export function classifyRelevance(title: string, company = "", description = ""): Relevance {
  const t = title.trim();
  if (!t) return { relevant: false, kind: null, reason: "no title" };

  let kind: RelevantKind | null = null;
  if (GTM.test(t)) kind = "GTM";
  else if (/\baccount executive\b/i.test(t)) kind = "Account Executive";   // "Senior Account Executive - Inside Sales" is an AE role
  else if (SDR.test(t)) kind = "SDR/BDR";
  else if (AE.test(t)) kind = "Account Executive";
  if (!kind) return { relevant: false, kind: null, reason: "not an SDR/BDR, GTM or Account Executive title" };

  if (LEADERSHIP.test(t) && !/lead (generation|development|gen)\b/i.test(t)) return { relevant: false, kind, reason: "a leadership or management role" };
  if (kind === "Account Executive" && SENIOR_AE.test(t)) return { relevant: false, kind, reason: "a senior or enterprise Account Executive role" };
  if (CONSUMER_TITLE.test(t) || CONSUMER_COMPANY.test(company) || consumerDescription(description)) {
    return { relevant: false, kind, reason: "consumer-facing or field selling, not B2B" };
  }
  return { relevant: true, kind, reason: "matches your roles" };
}

export const isRelevantRole = (title: string, company = "", description = ""): boolean => classifyRelevance(title, company, description).relevant;

/**
 * Title patterns for a database search that finds candidate roles quickly (a PostgREST "or" filter on title).
 * It is wider than the rule above on purpose; classifyRelevance makes the final call.
 */
export const RELEVANT_TITLE_PATTERNS = [
  "sdr", "bdr", "sales development", "business development", "inside sales", "lead generation", "lead development", "market development",
  "account development", "outbound", "gtm", "go-to-market", "go to market", "revenue operations", "revops", "growth engineer",
  "account executive", "demand generation",
] as const;

export const RELEVANT_TITLE_OR = RELEVANT_TITLE_PATTERNS.map((p) => `title.ilike.%${p}%`).join(",");
