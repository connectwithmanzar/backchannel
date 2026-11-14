// The Home "three things today" cards, the replies you are waiting on, and the weekly goal. Pure functions, tested without a database.

export interface TodayFacts {
  /** The target role whose referral step is not done yet, newest first. */
  topTarget: { company: string; title: string } | null;
  /** The best role at a company you watch, used when there is no target yet. */
  priorityJob: { company: string; title: string } | null;
  draftMessages: number;
  needsYou: number;
  readyToSend: number;
}

export interface TodayCard { n: 1 | 2 | 3; tag: string; title: string; body: string; href: string; cta: string }

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function todayCards(f: TodayFacts): TodayCard[] {
  const person = f.topTarget ?? f.priorityJob;
  const first: TodayCard = person
    ? {
        n: 1, tag: "Ask a person first", title: `Ask for a referral at ${person.company}`,
        body: `${person.title}. A referral gets you past the pile, so start here before you apply.`,
        href: `/referrals?company=${encodeURIComponent(person.company)}&role=${encodeURIComponent(person.title)}`, cta: "See who to ask",
      }
    : { n: 1, tag: "Ask a person first", title: "Pick a role worth a referral", body: "Star a role you really want on Swipe. It goes on your Target list with a plan.", href: "/swipe", cta: "Open Swipe" };

  const second: TodayCard = f.draftMessages > 0
    ? { n: 2, tag: "Approve", title: `${f.draftMessages} ${plural(f.draftMessages, "message is", "messages are")} ready for you`, body: "Drafted from your real experience. Nothing sends until you approve it.", href: "/outreach", cta: "Review messages" }
    : { n: 2, tag: "Approve", title: "No messages waiting", body: "When you find someone to ask, draft the message and it will wait here for your OK.", href: "/outreach", cta: "Open Messages" };

  const third: TodayCard = f.needsYou > 0
    ? { n: 3, tag: "Apply", title: `${f.needsYou} ${plural(f.needsYou, "application needs", "applications need")} your answer`, body: "Usually a visa, salary or notice-period question. Save your answers once and they stop blocking.", href: "/applications?show=needs_you", cta: "Finish them" }
    : f.readyToSend > 0
      ? { n: 3, tag: "Apply", title: `${f.readyToSend} ${plural(f.readyToSend, "application is", "applications are")} prepared`, body: "Ready to send. The robot picks up queued ones on its own.", href: "/applications", cta: "Review and send" }
      : { n: 3, tag: "Apply", title: "Swipe through new matches", body: "Pass, save or apply. Applying sends the application, with a few seconds to undo.", href: "/swipe", cta: "Start swiping" };
  return [first, second, third];
}

export interface WaitingInput { kind: "message" | "application"; label: string; sentAt: string | null }
export interface WaitingItem { label: string; kind: WaitingInput["kind"]; daysAgo: number; note: string }

/** Days since something was sent. A missing or future date gives 0. */
export function daysSince(iso: string | null, now = Date.now()): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && now > t ? Math.floor((now - t) / 864e5) : 0;
}

/** Oldest first, because the longest wait is the one to chase. Messages are due a nudge on day 3. */
export function waitingList(items: WaitingInput[], now = Date.now(), limit = 5): WaitingItem[] {
  return items
    .filter((i) => i.sentAt)
    .map((i): WaitingItem => {
      const d = daysSince(i.sentAt, now);
      const when = d === 0 ? "sent today" : d === 1 ? "sent yesterday" : `sent ${d} days ago`;
      const nudge = i.kind === "message" && d >= 3 ? " · follow-up due" : "";
      return { label: i.label, kind: i.kind, daysAgo: d, note: `${when}${nudge}` };
    })
    .sort((a, b) => b.daysAgo - a.daysAgo)
    .slice(0, limit);
}

export const WEEKLY_APPLICATION_GOAL = 20;

export function goalProgress(done: number, goal = WEEKLY_APPLICATION_GOAL): { done: number; goal: number; percent: number } {
  const safe = Math.max(0, done);
  return { done: safe, goal, percent: Math.max(0, Math.min(100, Math.round((safe / goal) * 100))) };
}
