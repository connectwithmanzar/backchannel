// Which Postgres schema holds Backchannel's tables. Today it is "public". After the move to a shared Supabase project
// it becomes "backchannel", changed by setting DB_SCHEMA on the server, with no further code change.

const VALID = /^[a-z_][a-z0-9_]{0,62}$/;

/** A safe schema name: anything unset or not a plain lowercase identifier falls back to "public". */
export function resolveDbSchema(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  return VALID.test(v) ? v : "public";
}

// Typed as "public" only so the Supabase client types stay the same everywhere; the real value is read at runtime.
export const DB_SCHEMA = resolveDbSchema(process.env.DB_SCHEMA) as "public";
