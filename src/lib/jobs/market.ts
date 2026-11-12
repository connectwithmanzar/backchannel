import type { Market } from "@/lib/collector/types";
import { detectMarket } from "./location";

const EMEA = ["uk", "ireland", "germany", "france", "netherlands", "spain", "nordics", "europe", "uae", "israel", "emea", "africa"];
/** Countries outside your usual target groups. A role there is "other", even when it says remote. */
const OTHER = ["singapore", "australia", "apac", "latam"];

function bucket(label: string, remoteType?: string | null): Market | null {
  if (label === "india") return remoteType === "remote" ? "remote-in" : "india";
  if (label === "us" || label === "canada") return "us";
  if (EMEA.includes(label)) return "emea";
  if (OTHER.includes(label)) return "other";
  return null;
}

/**
 * DB market label (country) + remote type + place name → the feed's market groups.
 * Older rows were stored as "Remote", "Other" or "Unknown" when the place was not recognised, so the place name is read
 * again. Only a role that says remote with no place, or "anywhere", counts as global; everything else unknown is "other".
 */
export function toMarket(label: string | null | undefined, remoteType?: string | null, location?: string | null): Market {
  const l = (label ?? "").toLowerCase();
  const direct = bucket(l, remoteType);
  if (direct) return direct;
  if (location) {
    const fromPlace = bucket(detectMarket(location).toLowerCase(), remoteType);
    if (fromPlace) return fromPlace;
  }
  return l === "remote" || remoteType === "remote" ? "global" : "other";
}

/** A preference country (e.g. "United Kingdom", "Remote") → market bucket(s). */
export function countryToMarkets(country: string): Market[] {
  const c = country.toLowerCase();
  if (c === "india") return ["india", "remote-in"];
  // The scorecard's own choices: "Remote India→US" is remote work; "India (onsite)" and "India (hybrid)" are in India.
  if (c.includes("remote") || c.includes("global") || c.includes("anywhere")) return ["global", "remote-in"];
  if (c.startsWith("india")) return ["india"];
  if (c.includes("united states") || c === "us" || c === "canada") return ["us"];
  if (c.includes("singapore") || c.includes("australia")) return ["other"];
  if (["united kingdom", "uk", "germany", "netherlands", "france", "ireland", "spain", "uae", "europe", "sweden", "denmark", "israel"].some((x) => c.includes(x))) return ["emea"];
  return ["global"];
}
