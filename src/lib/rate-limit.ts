// Simple in-memory rate limiter. Resets on cold start — sufficient for Vercel Hobby plan.
// For multi-instance production, replace with an Upstash/Redis-backed limiter.

const store = new Map<string, { count: number; reset: number }>();

/**
 * Returns true if the request is within the allowed rate.
 * @param key      Unique key (e.g. `curate:${userId}`)
 * @param limit    Max requests allowed within the window
 * @param windowMs Window duration in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.reset < now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/** Returns seconds remaining until the rate-limit window resets for a key. */
export function retryAfter(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  return Math.ceil((entry.reset - Date.now()) / 1000);
}

type Bump = (key: string, windowIso: string) => Promise<number | null>;

async function bumpInDatabase(key: string, windowIso: string): Promise<number | null> {
  try {
    const { serviceClient } = await import("@/lib/supabase/service");
    const { data, error } = await serviceClient().rpc("bump_usage", { p_key: key, p_window: windowIso });
    return error || typeof data !== "number" ? null : data;
  } catch {
    return null;
  }
}

/**
 * A rate limit shared by every server instance (a counter per fixed time window in the database).
 * If the database counter is not available it falls back to the per-instance limiter above, so nothing breaks.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number, bump: Bump = bumpInDatabase): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const count = await bump(key, new Date(windowStart).toISOString());
  if (count === null) return rateLimit(key, limit, windowMs);
  store.set(key, { count, reset: windowStart + windowMs });   // lets retryAfter() report the time left
  return count <= limit;
}
