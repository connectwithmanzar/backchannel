import { FX_TO_USD } from "@/lib/score";

export type PayDisplay = "INR" | "USD" | "original";

/** Converts through US dollars using the rough fixed rates in score.ts. Returns undefined for unknown currencies. */
export function convert(amount: number | undefined, from: string | undefined, to: "INR" | "USD"): number | undefined {
  if (!amount || !from || !FX_TO_USD[from]) return undefined;
  const usd = amount * FX_TO_USD[from];
  return to === "USD" ? usd : usd / FX_TO_USD.INR;
}

/** Indian style: ₹85,000, ₹45 L (lakh), ₹1.2 Cr (crore). */
export function formatInr(n: number): string {
  const v = Math.abs(n);
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, "");
  if (v >= 1e7) return `₹${trim(v / 1e7)} Cr`;
  if (v >= 1e5) return `₹${trim(v / 1e5)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function formatUsd(n: number): string {
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1000)}k`;
}

function formatOriginal(n: number, cur: string): string {
  if (cur === "INR") return formatInr(n);
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$" };
  return `${sym[cur] ?? `${cur} `}${Math.round(n / 1000)}k`;
}

/** One amount in the chosen display currency. Falls back to the original when it cannot be converted. */
export function formatAmount(amount: number | undefined, currency: string | undefined, display: PayDisplay): string {
  if (!amount || !currency) return "";
  if (display === "original") return formatOriginal(amount, currency);
  const converted = convert(amount, currency, display);
  if (converted === undefined) return formatOriginal(amount, currency);
  return display === "INR" ? formatInr(converted) : formatUsd(converted);
}

/** "₹32 L – ₹45 L" for a pay range; just the top figure when only one end is known. */
export function formatPay(min: number | undefined, max: number | undefined, currency: string | undefined, display: PayDisplay): string {
  const hi = formatAmount(max, currency, display);
  const lo = formatAmount(min, currency, display);
  if (!hi) return lo;
  return lo && lo !== hi ? `${lo} – ${hi}` : hi;
}

/** A US-dollar threshold written in the display currency (used by the minimum-pay slider). */
export function formatUsdThreshold(usd: number, display: PayDisplay): string {
  if (!usd) return "any";
  return display === "INR" ? `${formatInr(usd / FX_TO_USD.INR)}+` : `${formatUsd(usd)}+`;
}
