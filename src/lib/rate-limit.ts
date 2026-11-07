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
