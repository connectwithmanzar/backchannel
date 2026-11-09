import type { Market } from "@/lib/collector/types";

const EMEA = ["uk", "ireland", "germany", "france", "netherlands", "spain", "nordics", "europe", "uae", "israel", "emea"];

/** DB market label (country) + remote type → the feed's market buckets. */
export function toMarket(label: string | null | undefined, remoteType?: string | null): Market {
  const l = (label ?? "").toLowerCase();
  if (l === "india") return remoteType === "remote" ? "remote-in" : "india";
  if (l === "us" || l === "canada") return "us";
  if (EMEA.includes(l)) return "emea";
  return "global";
}

/** A preference country (e.g. "United Kingdom", "Remote") → market bucket(s). */
export function countryToMarkets(country: string): Market[] {
  const c = country.toLowerCase();
  if (c === "india") return ["india", "remote-in"];
  if (c.includes("united states") || c === "us" || c === "canada") return ["us"];
  if (c.includes("remote") || c.includes("global") || c.includes("anywhere")) return ["global", "remote-in"];
  if (["united kingdom", "uk", "germany", "netherlands", "france", "ireland", "spain", "uae", "europe", "sweden", "denmark", "israel"].some((x) => c.includes(x))) return ["emea"];
  return ["global"];
}
