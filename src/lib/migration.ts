// Shared wording for features that need migration 0017. Until it is run, these features show a plain message instead of failing.

export const MIGRATION_0017 = "This needs one database update first. Run supabase/migrations/0017_priority_tools.sql in Supabase (SQL Editor, paste, Run), then try again.";

export const MIGRATION_0018 = "Tiers C and D and company research need one more database update. Run supabase/migrations/0018_company_research.sql in Supabase (SQL Editor, paste, Run), then try again.";

/** True when a database error means a table or column from a migration is not there yet. */
export function isMissingSchema(e: { message?: string; code?: string } | null | undefined): boolean {
  return !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|could not find|schema cache/i.test(e.message ?? ""));
}

/** True when a tier was refused because the database only allows A and B so far (migration 0018 not run). */
export const isTierConstraint = (e: { message?: string; code?: string } | null | undefined): boolean =>
  !!e && (e.code === "23514" || /watchlist_tier_check|violates check constraint/i.test(e.message ?? ""));
