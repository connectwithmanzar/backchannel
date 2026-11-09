import { FX_TO_USD, toUsd } from "@/lib/score";

export interface OfferInput {
  id: string; company: string; role_title: string | null; location: string | null; currency: string;
  base: number | null; variable: number | null; joining_bonus: number | null;
  equity_note: string | null; visa_note: string | null; notes: string | null; deadline: string | null; status: string;
}

export const OFFER_CURRENCIES = Object.keys(FX_TO_USD);

export interface OfferRow extends OfferInput {
  yearOneUsd: number | null;   // base + variable (+ joining bonus) in USD
  annualUsd: number | null;    // base + variable in USD, the repeating yearly cash
  rank: number | null;         // 1 = highest yearly cash among offers still open
  isBest: boolean;
}

/** Yearly cash converted to USD, ranked among offers that are still open. Equity and visa are shown, never guessed. */
export function compareOffers(offers: OfferInput[]): OfferRow[] {
  const rows = offers.map((o) => {
    const cash = (o.base ?? 0) + (o.variable ?? 0);
    const annualUsd = o.base == null && o.variable == null ? null : toUsd(cash, o.currency) ?? null;
    const yearOneUsd = annualUsd == null ? null : annualUsd + (toUsd(o.joining_bonus ?? 0, o.currency) ?? 0);
    return { ...o, annualUsd, yearOneUsd, rank: null as number | null, isBest: false };
  });
  const open = rows.filter((r) => r.annualUsd != null && ["considering", "accepted"].includes(r.status)).sort((a, b) => (b.annualUsd ?? 0) - (a.annualUsd ?? 0));
  open.forEach((r, i) => { r.rank = i + 1; r.isBest = i === 0 && open.length > 1; });
  return rows;
}
