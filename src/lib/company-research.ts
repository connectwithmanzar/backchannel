// What Backchannel knows about a company: facts from open web search (a draft you correct), and review ratings.
// Nothing is invented: anything not found stays empty and shows as "not found".

export const WORK_MODES = ["remote", "hybrid", "office", "mixed"] as const;
export type WorkMode = typeof WORK_MODES[number];

export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", office: "In office", mixed: "Mixed by team" };

export interface Research {
  website: string | null;
  hq: string | null;
  work_mode: WorkMode | null;
  hiring_locations: string | null;
  pay_note: string | null;
  perks: string[];
  summary: string | null;
  glassdoor_rating: number | null;
  ambitionbox_rating: number | null;
  wlb_rating: number | null;
  growth_rating: number | null;
  /** Field name to the page the fact came from. */
  sources: Record<string, string>;
  researched_at: string | null;
}

export const EMPTY_RESEARCH: Research = {
  website: null, hq: null, work_mode: null, hiring_locations: null, pay_note: null, perks: [], summary: null,
  glassdoor_rating: null, ambitionbox_rating: null, wlb_rating: null, growth_rating: null, sources: {}, researched_at: null,
};

const FIELDS = ["website", "hq", "work_mode", "hiring_locations", "pay_note", "perks", "summary", "glassdoor_rating", "ambitionbox_rating", "wlb_rating", "growth_rating"] as const;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t && !/^(n\/a|none|unknown|not found|null)$/i.test(t) ? t : null;
};

/** A rating on a 5-point scale, to one decimal, or null. */
export const rating = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
};

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try { const u = new URL(v.trim()); return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : null; } catch { return null; }
};

const website = (v: unknown): string | null => {
  const t = text(v, 200);
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withProto); return u.hostname.includes(".") ? u.hostname.replace(/^www\./, "") : null; } catch { return null; }
};

/** Cleans a draft from the AI, or a form from the screen, into a safe Research. Unknown fields are dropped. */
export function sanitizeResearch(raw: unknown): Research {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = typeof r.work_mode === "string" ? r.work_mode.toLowerCase().trim() : "";
  const sources: Record<string, string> = {};
  if (r.sources && typeof r.sources === "object") {
    for (const [k, v] of Object.entries(r.sources as Record<string, unknown>)) {
      const url = httpsUrl(v);
      if ((FIELDS as readonly string[]).includes(k) && url) sources[k] = url;
    }
  }
  const perks = Array.isArray(r.perks) ? r.perks.map((p) => text(p, 80)).filter((p): p is string => !!p).slice(0, 6) : [];
  return {
    website: website(r.website),
    hq: text(r.hq, 120),
    work_mode: (WORK_MODES as readonly string[]).includes(mode) ? (mode as WorkMode) : null,
    hiring_locations: text(r.hiring_locations, 200),
    pay_note: text(r.pay_note, 300),
    perks: [...new Set(perks)],
    summary: text(r.summary, 500),
    glassdoor_rating: rating(r.glassdoor_rating),
    ambitionbox_rating: rating(r.ambitionbox_rating),
    wlb_rating: rating(r.wlb_rating),
    growth_rating: rating(r.growth_rating),
    sources,
    researched_at: typeof r.researched_at === "string" ? r.researched_at : null,
  };
}

/** The searches that find a company's work mode, pay, perks and what employees say. */
export function researchQueries(name: string, domain?: string | null): string[] {
  const co = `"${name.replace(/"/g, "").trim()}"`;
  const site = domain ? ` ${domain}` : "";
  return [
    `${co}${site} company headquarters work from home remote hybrid office policy`,
    `${co} sales development representative salary India fixed variable benefits perks`,
    `${co} employee reviews rating work life balance career growth promotions`,
  ];
}

/** Links that open a company's review pages for you to read. Backchannel does not read those sites for you. */
export function reviewLinks(name: string): { glassdoor: string; ambitionbox: string } {
  const q = (site: string) => `https://www.google.com/search?q=${encodeURIComponent(`${name} ${site} reviews`)}`;
  return { glassdoor: q("glassdoor"), ambitionbox: q("ambitionbox") };
}
