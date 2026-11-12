// No node: imports: the middleware runs on a runtime that does not provide them.
/** True when `given` equals the WARM_KEY setting. Trims both sides and fails closed when no key is configured. */
export function isWarmAuthorized(given: string | null | undefined, configured: string | undefined = process.env.WARM_KEY): boolean {
  const secret = (configured ?? "").trim();
  const value = (given ?? "").trim();
  if (secret.length < 16 || !value) return false;
  if (value.length !== secret.length) return false;
  let diff = 0; // look at every character so the time taken does not reveal where a guess went wrong
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ value.charCodeAt(i);
  return diff === 0;
}

/** Pages whose server code is loaded by the warm-up, so the first real visit after a quiet spell is not a cold start. */
export const WARM_PATHS = ["/today", "/roles", "/saved", "/companies", "/outreach", "/referrals", "/offers", "/profile", "/login"];
