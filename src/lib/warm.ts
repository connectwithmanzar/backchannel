import { timingSafeEqual } from "node:crypto";

/** True when `given` equals the WARM_KEY setting. Trims both sides and fails closed when no key is configured. */
export function isWarmAuthorized(given: string | null | undefined, configured: string | undefined = process.env.WARM_KEY): boolean {
  const secret = (configured ?? "").trim();
  const value = (given ?? "").trim();
  if (secret.length < 16 || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pages whose server code is loaded by the warm-up, so the first real visit after a quiet spell is not a cold start. */
export const WARM_PATHS = ["/today", "/roles", "/companies", "/outreach", "/referrals", "/offers", "/profile", "/login"];
