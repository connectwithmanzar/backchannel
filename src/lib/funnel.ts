export type Track = "fast" | "stretch";

const FAST_MARKETS = ["india", "uae", "saudi arabia", "saudi", "qatar", "kuwait", "bahrain", "oman", "gulf", "middle east"];

/** Fast track: markets where hiring is quick (India, Gulf). Everything else is the stretch track. */
export function trackOf(market: string | null | undefined): Track {
  const m = (market ?? "").trim().toLowerCase();
  return FAST_MARKETS.includes(m) ? "fast" : "stretch";
}

export type FunnelEvent = { type: string; occurred_at: string };

export const INTERVIEW_GOAL = { min: 5, max: 10 };

export interface WeekCounts {
  applied: number;
  sent: number;
  replies: number;
  referrals: number;
  interviews: number;
}

function countWeek(events: FunnelEvent[], from: number, to: number): WeekCounts {
  const inRange = events.filter((e) => {
    const t = Date.parse(e.occurred_at);
    return t >= from && t < to;
  });
  const n = (type: string) => inRange.filter((e) => e.type === type).length;
  return { applied: n("applied"), sent: n("outreach_sent"), replies: n("reply"), referrals: n("referral"), interviews: n("interview") };
}

/** Replies per 100 emails sent, or null when nothing was sent (avoids a fake 0%). */
export function replyRate(c: WeekCounts): number | null {
  return c.sent > 0 ? Math.round((c.replies / c.sent) * 1000) / 10 : null;
}

export function weeklyFunnel(events: FunnelEvent[], now = Date.now()) {
  const week = 7 * 864e5;
  const thisWeek = countWeek(events, now - week, now + 1);
  const lastWeek = countWeek(events, now - 2 * week, now - week);
  return { thisWeek, lastWeek, replyRate: replyRate(thisWeek), goal: INTERVIEW_GOAL };
}
