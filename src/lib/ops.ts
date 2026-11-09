import { isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";

/** Tells an outside monitor (for example Healthchecks.io) that a scheduled job ran. No URL set means nothing happens. */
export async function pingHeartbeat(url: string | undefined): Promise<void> {
  if (!url) return;
  try { await fetch(url, { method: "GET", signal: AbortSignal.timeout(5_000) }); } catch { /* a monitor outage must not break the job */ }
}

/** Messages the owner on Telegram when a scheduled job step fails, so a silent failure is not silent. */
export async function alertOps(text: string): Promise<void> {
  if (!isTelegramConfigured()) return;
  try { await sendTelegramMessage(`<b>Backchannel</b>\n${text}`); } catch { /* alerting is best effort */ }
}

/** Step names that reported an error in one user's result object. */
export function failedSteps(result: Record<string, unknown>): string[] {
  return Object.entries(result).filter(([, v]) => !!v && typeof v === "object" && "error" in (v as object)).map(([k]) => k);
}
