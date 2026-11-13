// One plain status for each application, worked out from the several fields the app keeps.
// Pure functions, so they are tested without a database.

export type AppGroup = "needs_you" | "in_progress" | "submitted" | "interview" | "offer" | "closed";

export interface AppFacts {
  status: string | null;
  stage: string | null;
  auto_status: string | null;
  auto_log: string | null;
}

export const GROUP_ORDER: AppGroup[] = ["needs_you", "in_progress", "submitted", "interview", "offer", "closed"];
export const GROUP_LABEL: Record<AppGroup, string> = {
  needs_you: "Needs you",
  in_progress: "In progress",
  submitted: "Submitted",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

/** Minutes a hand-filled application takes. An estimate, shown as one. */
export const MINUTES_PER_APPLICATION = 12;

export function groupOf(a: AppFacts): AppGroup {
  if (a.stage === "offer") return "offer";
  if (a.stage === "rejected" || a.stage === "withdrawn" || a.status === "skipped") return "closed";
  if (a.stage === "screening" || a.stage === "interview" || a.stage === "final") return "interview";
  if (a.status === "needs_answer" || a.auto_status === "needs_you" || a.auto_status === "failed") return "needs_you";
  if (a.status === "submitted" || a.auto_status === "submitted") return "submitted";
  return "in_progress";
}

/** One short line saying what is happening right now. */
export function detailOf(a: AppFacts): string {
  const g = groupOf(a);
  if (g === "needs_you") {
    if (a.status === "needs_answer") return "A question needs your own answer (visa, salary or notice period).";
    return a.auto_log?.trim().split("\n").pop()?.slice(0, 160) || "The robot could not finish this one. Open it to send it yourself.";
  }
  if (g === "in_progress") {
    if (a.auto_status === "queued") return "Queued for the auto-apply robot.";
    if (a.auto_status === "running") return "The robot is filling the form now.";
    if (a.auto_status === "filled") return "Form filled, waiting to be sent.";
    if (a.status === "scheduled") return "Scheduled to send.";
    return "Prepared, not sent yet.";
  }
  if (g === "submitted") return "Sent. Waiting to hear back.";
  if (g === "interview") return a.stage === "screening" ? "In screening." : a.stage === "final" ? "Final round." : "Interviewing.";
  if (g === "offer") return "You have an offer.";
  return a.status === "skipped" ? "Skipped." : a.stage === "withdrawn" ? "You withdrew." : "Not moving forward.";
}

export interface Summary {
  counts: Record<AppGroup, number>;
  sent: number;
  minutesSaved: number;
}

/** Counts per group, how many were sent, and the time saved by not filling them by hand. */
export function summarise(apps: AppFacts[]): Summary {
  const counts = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<AppGroup, number>;
  let sent = 0;
  for (const a of apps) {
    const g = groupOf(a);
    counts[g] += 1;
    if (g === "submitted" || g === "interview" || g === "offer" || a.status === "submitted" || a.auto_status === "submitted") sent += 1;
  }
  return { counts, sent, minutesSaved: sent * MINUTES_PER_APPLICATION };
}

export function timeSavedText(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
