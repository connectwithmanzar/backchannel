// How a company's review rating becomes a tier. These cut-offs are the owner's own rule.
//   A: 3.5 and above   B: 3.0 to 3.4   C: 2.5 to 2.9   D: below 2.5   No rating: not rated (never guessed)

export type Tier = "A" | "B" | "C" | "D";
export const TIERS: readonly Tier[] = ["A", "B", "C", "D"];

export const TIER_MEANING: Record<Tier, string> = {
  A: "Top target",
  B: "Good, worth pursuing",
  C: "Only if the role is great",
  D: "Skip",
};

export const isTier = (v: unknown): v is Tier => v === "A" || v === "B" || v === "C" || v === "D";

const isRating = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5;

/** Average of the overall ratings you have (Glassdoor, AmbitionBox). Null when there are none. */
export function averageRating(values: (number | null | undefined)[]): number | null {
  const ok = values.filter(isRating);
  if (!ok.length) return null;
  return Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10;
}

export function tierFromRating(rating: number | null): Tier | null {
  if (rating === null || !isRating(rating)) return null;
  if (rating >= 3.5) return "A";
  if (rating >= 3.0) return "B";
  if (rating >= 2.5) return "C";
  return "D";
}

export interface RatingInput { glassdoor_rating?: number | null; ambitionbox_rating?: number | null }

/** The tier Backchannel suggests from the overall ratings you have. `tier` is null when there is nothing to rate on. */
export function suggestTier(r: RatingInput | null | undefined): { average: number | null; tier: Tier | null } {
  const average = averageRating([r?.glassdoor_rating, r?.ambitionbox_rating]);
  return { average, tier: tierFromRating(average) };
}

/** Derives an automated tier based on real-time hiring volume and company signals */
export function automatedTier(c?: { roles?: number; hiring?: string | null; hasBoard?: boolean } | null): Tier | null {
  if (!c) return null;
  const roles = c.roles ?? 0;
  if (c.hiring === "hiring_surge" || roles >= 5) return "A";
  if (roles >= 2 || c.hasBoard) return "B";
  if (roles === 1) return "C";
  return "D";
}

/** Your confirmed tier wins; otherwise review rating suggestion, then automated hiring signals. */
export function effectiveTier(
  confirmed: unknown,
  r: RatingInput | null | undefined,
  meta?: { roles?: number; hiring?: string | null; hasBoard?: boolean } | null
): { tier: Tier | null; suggested: boolean } {
  if (isTier(confirmed)) return { tier: confirmed, suggested: false };
  const s = suggestTier(r).tier;
  if (s !== null) return { tier: s, suggested: true };
  if (meta) {
    const auto = automatedTier(meta);
    if (auto !== null) return { tier: auto, suggested: true };
  }
  return { tier: null, suggested: false };
}

/** Sort order for lists: A first, then B, C, companies with no tier, and D last. */
export const tierRank = (t: Tier | null | undefined): number => (t === "A" ? 4 : t === "B" ? 3 : t === "C" ? 2 : t === "D" ? 0 : 1);
