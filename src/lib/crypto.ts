import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts stored secrets (Gmail refresh tokens) with a key that lives only in the host's environment, so a leaked
// database copy alone is not enough to read them. Without TOKEN_ENC_KEY (64 hex characters) values stay as they are.
const PREFIX = "enc:v1:";

function key(env: Record<string, string | undefined> = process.env): Buffer | null {
  const hex = (env.TOKEN_ENC_KEY ?? "").trim();
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string, env?: Record<string, string | undefined>): string {
  const k = key(env);
  if (!k || isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(value: string, env?: Record<string, string | undefined>): string {
  if (!isEncrypted(value)) return value;           // stored before encryption was switched on
  const k = key(env);
  if (!k) throw new Error("A stored secret is encrypted but TOKEN_ENC_KEY is not set.");
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
