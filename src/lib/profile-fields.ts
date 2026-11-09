// Only these fields may be written from the browser. Send-safety settings (auto-send, warm-up start,
// daily limit, autopilot) are changed only through their own routes, which validate them.
const PROFILE_FIELDS = [
  "name", "current_role", "years_in_sales", "quota_attainment_pct", "meetings_per_month", "segment", "motion", "tools",
  "target_titles", "markets", "min_ote_usd", "min_ote_by_market", "stealth", "cv_text", "cv_file_path",
] as const;
const PREFERENCE_FIELDS = ["great_company_criteria", "valued_awards", "countries", "dealbreakers"] as const;

function pick(payload: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of allowed) if (k in payload && payload[k] !== undefined) out[k] = payload[k];
  return out;
}

export const pickProfileFields = (p: Record<string, unknown>) => pick(p, PROFILE_FIELDS);
export const pickPreferenceFields = (p: Record<string, unknown>) => pick(p, PREFERENCE_FIELDS);
