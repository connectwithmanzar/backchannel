// Shared wording for features that need migration 0017. Until it is run, these features show a plain message instead of failing.

export const MIGRATION_0017 = "This needs one database update first. Run supabase/migrations/0017_priority_tools.sql in Supabase (SQL Editor, paste, Run), then try again.";

/** True when a database error means a table or column from a migration is not there yet. */
export function isMissingSchema(e: { message?: string; code?: string } | null | undefined): boolean {
  return !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|could not find|schema cache/i.test(e.message ?? ""));
}
