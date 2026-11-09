// Sending safety rules kept as plain functions so they can be tested without Gmail or the database.
export const MAX_EMAILS_PER_DAY = 20;

// A new sending habit ramps up over two weeks: 5, 10, 15, then 20 a day.
const RAMP: { fromDay: number; limit: number }[] = [
  { fromDay: 0, limit: 5 }, { fromDay: 4, limit: 10 }, { fromDay: 8, limit: 15 }, { fromDay: 12, limit: MAX_EMAILS_PER_DAY },
];

export function rampLimit(rampStart: string | null | undefined, now = Date.now()): number {
  if (!rampStart) return RAMP[0].limit;
  const days = Math.max(0, Math.floor((now - Date.parse(rampStart)) / 864e5));
  return [...RAMP].reverse().find((r) => days >= r.fromDay)?.limit ?? RAMP[0].limit;
}

/** Daily cap = the lowest of your own setting, the 20 a day ceiling and the warm-up ramp. */
export function effectiveDailyLimit(userLimit: number | null | undefined, rampStart: string | null | undefined, now = Date.now()): number {
  return Math.min(MAX_EMAILS_PER_DAY, userLimit ?? MAX_EMAILS_PER_DAY, rampLimit(rampStart, now));
}

export const BOUNCE_PAUSE_RATE = 0.02;
export const BOUNCE_MIN_SAMPLE = 10;

/** Auto-send pauses when more than 2% of recent emails bounced (needs at least 10 sent to judge). */
export function bouncePaused(sent: number, bounced: number): boolean {
  return sent >= BOUNCE_MIN_SAMPLE && bounced / sent > BOUNCE_PAUSE_RATE;
}

/** The bare address in a From header: "Jo Ann <JoAnn@X.com>" becomes "joann@x.com". */
export function fromAddress(header: string): string {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).trim().toLowerCase();
}

/** "Delivery Status Notification (Delay)": the message is late, not undeliverable. */
export function isDelayNotice(subject: string): boolean {
  return /\(delay\)|has been delayed|delivery delayed|still trying/i.test(subject);
}

/** Out-of-office and other automatic answers are not a person replying. */
export function isAutoReply(subject: string): boolean {
  return /^(automatic reply|auto[- ]?reply|autoreply|out of (the )?office|away from (my )?office|on vacation)/i.test(subject.trim());
}

/** A permanent delivery-failure notice from Google or the recipient's server, not a human reply. */
export function isBounceMessage(from: string, subject: string): boolean {
  if (isDelayNotice(subject)) return false;
  return /mailer-daemon|postmaster/i.test(from) || /delivery status notification|undeliverable|delivery has failed|mail delivery (subsystem|failed)|returned mail/i.test(subject);
}
