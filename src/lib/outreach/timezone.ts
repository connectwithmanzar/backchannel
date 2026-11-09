// When an AUTOMATIC email may go out: during the recipient's own morning, on their working days.
// Manual sends (you click Send) ignore all of this. The 9:00 to 11:30 local morning is a common rule of
// thumb for cold outreach, not something measured on your replies yet.
export const WINDOW_START = 9;
export const WINDOW_END = 11.5;
export const FALLBACK_TZ = "Asia/Kolkata";

export interface RecipientHints { market?: string | null; location?: string | null; email?: string | null }

const TLD_TZ: Record<string, string> = {
  ae: "Asia/Dubai", sa: "Asia/Riyadh", qa: "Asia/Qatar", kw: "Asia/Kuwait", bh: "Asia/Bahrain", om: "Asia/Muscat",
  in: "Asia/Kolkata", sg: "Asia/Singapore", il: "Asia/Jerusalem", au: "Australia/Sydney",
  uk: "Europe/London", ie: "Europe/Dublin", de: "Europe/Berlin", fr: "Europe/Paris", nl: "Europe/Amsterdam",
  es: "Europe/Madrid", it: "Europe/Rome", se: "Europe/Stockholm", dk: "Europe/Copenhagen", ca: "America/Toronto",
};

const MARKET_TZ: Record<string, string> = {
  india: "Asia/Kolkata", uae: "Asia/Dubai", "saudi arabia": "Asia/Riyadh", saudi: "Asia/Riyadh", qatar: "Asia/Qatar",
  kuwait: "Asia/Kuwait", bahrain: "Asia/Bahrain", oman: "Asia/Muscat", gulf: "Asia/Dubai", "middle east": "Asia/Dubai",
  uk: "Europe/London", ireland: "Europe/Dublin", germany: "Europe/Berlin", france: "Europe/Paris", netherlands: "Europe/Amsterdam",
  spain: "Europe/Madrid", nordics: "Europe/Stockholm", europe: "Europe/Berlin", emea: "Europe/Berlin", israel: "Asia/Jerusalem",
  us: "America/New_York", canada: "America/Toronto", singapore: "Asia/Singapore", australia: "Australia/Sydney",
};

const LOCATION_TZ: [RegExp, string][] = [
  [/dubai|abu dhabi|sharjah|uae|united arab emirates/i, "Asia/Dubai"], [/riyadh|jeddah|saudi/i, "Asia/Riyadh"], [/doha|qatar/i, "Asia/Qatar"],
  [/london|united kingdom|\buk\b|manchester|england/i, "Europe/London"], [/dublin|ireland/i, "Europe/Dublin"], [/berlin|munich|germany/i, "Europe/Berlin"],
  [/paris|france/i, "Europe/Paris"], [/amsterdam|netherlands/i, "Europe/Amsterdam"], [/madrid|barcelona|spain/i, "Europe/Madrid"],
  [/stockholm|sweden/i, "Europe/Stockholm"], [/tel aviv|israel/i, "Asia/Jerusalem"], [/singapore/i, "Asia/Singapore"],
  [/bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|india/i, "Asia/Kolkata"],
  [/san francisco|los angeles|seattle|california/i, "America/Los_Angeles"], [/chicago|austin|dallas|texas/i, "America/Chicago"],
  [/new york|boston|atlanta|miami|washington|united states|\bus\b|usa/i, "America/New_York"],
];

/** Best guess of the recipient's timezone from their email domain, the job's market and its location text. */
export function recipientTimezone(h: RecipientHints): string {
  const tld = (h.email ?? "").split("@")[1]?.toLowerCase().split(".").pop() ?? "";
  if (TLD_TZ[tld]) return TLD_TZ[tld];
  const market = MARKET_TZ[(h.market ?? "").trim().toLowerCase()];
  if (market && !/^(europe|emea|us|canada)$/i.test(h.market ?? "")) return market;
  for (const [re, tz] of LOCATION_TZ) if (re.test(h.location ?? "")) return tz;
  return market ?? FALLBACK_TZ;
}

const FRI_SAT_WEEKEND = new Set(["Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat", "Asia/Jerusalem"]);

/** True during the recipient's morning window on one of their working days. */
export function inRecipientWindow(tz: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday");
  const decimalHour = Number(get("hour")) + Number(get("minute")) / 60;
  const weekend = FRI_SAT_WEEKEND.has(tz) ? ["Fri", "Sat"] : ["Sat", "Sun"];
  return !weekend.includes(day) && decimalHour >= WINDOW_START && decimalHour < WINDOW_END;
}
