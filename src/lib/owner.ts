import { timingSafeEqual } from "node:crypto";

// Server-only helper: is this the app owner (admin actions such as Run now / Score all)?
// This does NOT restrict who can sign in. Reads NEXT_PUBLIC_OWNER_EMAIL (kept as-is so
// existing owner checks keep working) and compares case- and whitespace-insensitively.
export function ownerEmail(): string {
  return (process.env.NEXT_PUBLIC_OWNER_EMAIL ?? "").trim().toLowerCase();
}

export function isOwner(email: string | null | undefined): boolean {
  const owner = ownerEmail();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}

// Cron endpoints: require Authorization: Bearer CRON_SECRET. Fails closed when unset.
export function isCronAuthorized(authHeader: string | null, secretValue: string | undefined = process.env.CRON_SECRET): boolean {
  // Trim both sides: a pasted secret often carries a trailing space or newline.
  const secret = (secretValue ?? "").trim();
  if (!secret) return false;
  const a = Buffer.from((authHeader ?? "").trim());
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
