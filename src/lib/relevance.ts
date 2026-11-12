// Which roles are relevant to the owner (his list of 12 Nov 2026):
//   - SDR/BDR at any level, including senior
//   - any GTM or revenue operations role
//   - inside sales associates and executives
//   - B2B sales, not leadership (account executives of any level, B2B sales executives and representatives)
//   - SaaS sales
//   - advertising sales
// Not relevant: heads, VPs, directors, managers and team leads in sales, and consumer-facing or field selling.
// The rule reads only the title, the company name and, for B2B signals, the start of the description.

export type RelevantKind = "SDR/BDR" | "GTM" | "Inside sales" | "Account Executive" | "B2B sales" | "SaaS sales" | "Ad sales";

export interface Relevance { relevant: boolean; kind: RelevantKind | null; reason: string }

/** Sales leadership: heads, VPs, directors, chiefs, managers, team leads. GTM roles are checked more gently below. */
const LEADERSHIP = /\b(head|vp|vice president|avp|director|chief|cro|president|general manager|gm|manager|managing|team lead|lead,|principal|staff)\b/i;
/** The very top of the ladder, which is excluded even for GTM roles. */
const TOP_LEADERSHIP = /\b(head|vp|vice president|avp|director|chief|cro|president|general manager)\b/i;

const GTM = /\b(gtm|go[- ]to[- ]market|revenue operations|revops|growth engineer|sales (operations|ops) (specialist|analyst|associate|coordinator))\b/i;
const SDR = /\b(sdr|bdr|adr|sales development|business development (rep|representative|executive|associate|specialist|analyst|officer)|lead (generation|development|gen)|market development|account development|outbound sales|outbound (rep|representative)|demand generation (rep|representative|executive|associate)|appointment setter|sales outreach|pipeline generation)\b/i;
const INSIDE_SALES = /\binside sales\b/i;
const AE = /\b(account executive|ae)\b/i;
const AD_SALES = /\b(ad|ads|advertising|advertiser|advertisers|media|programmatic|adtech|display|performance marketing|publisher) sales\b|\bsales (executive|representative|rep|associate|specialist|consultant|manager)?,? ?(advertising|ad sales|media sales)\b|\badvertising (account|sales)\b|\bad sales\b/i;
const SAAS = /\b(saas|software as a service|cloud software)\b/i;
const B2B = /\b(b2b|saas|enterprise|corporate|commercial|mid[- ]?market|smb|software|solutions?|technology|it services|platform)\b/i;
/** A plain individual-contributor sales title, which only counts when something shows it is B2B. */
const SALES_IC = /\b(sales (executive|representative|rep|associate|specialist|consultant|professional|officer|partner)|business development (executive|associate|representative))\b/i;

// Consumer-facing or field selling, which is not what he is looking for. Checked on the title and company name.
const CONSUMER_TITLE = /\b(personal loans?|home loans?|loans?|insurance|credit card|mutual fund|demat|trading|real estate|property|dsa|telecaller|tele[- ]?calling|tele[- ]?sales|field (sales|executive)|retail|branch|walk[- ]?in|store|showroom|hospitality|hotel|gym|fitness|salon|spa|counsel+or|admission|academic|collections?|recovery|banking|bank|relationship manager|channel sales|distributor|fmcg|pharma rep|medical rep|driver|delivery)\b/i;
const CONSUMER_COMPANY = /\b(bank|insurance|assurance|finance ltd|housing finance|realty|properties|hotels?|resorts?|hospital|clinic|school|college|university)\b/i;
/** Pre-sales, support and success roles are not sales roles. */
const NOT_SALES = /\b(sales engineer|solutions? engineer|solutions? consultant|customer success|customer support|support engineer|sales enablement|sales trainer|recruiter|talent)\b/i;

/** True when the description says it is selling to consumers and never mentions businesses. */
function consumerDescription(description: string): boolean {
  const d = description.slice(0, 1500).toLowerCase();
  return /\bb2c\b|direct to consumer|walk-?in customers|door[- ]to[- ]door/.test(d) && !/\bb2b\b|\bsaas\b|enterprise customers/.test(d);
}

export function classifyRelevance(title: string, company = "", description = ""): Relevance {
  const t = title.trim();
  if (!t) return { relevant: false, kind: null, reason: "no title" };
  if (NOT_SALES.test(t)) return { relevant: false, kind: null, reason: "not a selling role" };

  const isAdSales = AD_SALES.test(t);
  const isSaas = SAAS.test(t) && /\b(sales|account|business development|executive|representative|rep|associate)\b/i.test(t);
  let kind: RelevantKind | null = null;
  if (GTM.test(t)) kind = "GTM";
  else if (isAdSales) kind = "Ad sales";
  else if (/\baccount executive\b/i.test(t)) kind = "Account Executive";
  else if (SDR.test(t)) kind = "SDR/BDR";
  else if (INSIDE_SALES.test(t)) kind = "Inside sales";
  else if (isSaas) kind = "SaaS sales";
  else if (AE.test(t)) kind = "Account Executive";
  else if (SALES_IC.test(t) && (B2B.test(t) || B2B.test(company) || B2B.test(description.slice(0, 1200)))) kind = "B2B sales";
  if (!kind) return { relevant: false, kind: null, reason: "not one of your kinds of role" };

  // Leadership. A GTM role of any level is relevant unless it is a head, VP or director. "Lead generation" is not a team lead.
  const leadership = kind === "GTM" ? TOP_LEADERSHIP.test(t) : LEADERSHIP.test(t) && !/lead (generation|development|gen)\b/i.test(t);
  if (leadership) return { relevant: false, kind, reason: "a leadership or management role" };

  // Ad sales and GTM are B2B by nature; everything else must not look consumer-facing.
  if (kind !== "Ad sales" && kind !== "GTM" && (CONSUMER_TITLE.test(t) || CONSUMER_COMPANY.test(company) || consumerDescription(description))) {
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
  "account executive", "demand generation", "sales executive", "sales representative", "sales associate", "sales specialist", "sales consultant",
  "b2b", "saas", "advertis", "ad sales", "media sales", "programmatic",
] as const;

export const RELEVANT_TITLE_OR = RELEVANT_TITLE_PATTERNS.map((p) => `title.ilike.%${p}%`).join(",");
