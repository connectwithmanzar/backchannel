import { sourceLabel } from "@/lib/role-filters";

export interface PipelineApp { stage: string | null; status: string; board: string | null }
export interface PipelineStep { contact_id: string; channel: string; status: string }

export interface PipelineInput { saved: number; apps: PipelineApp[]; steps: PipelineStep[]; referralInterviews: number }

export interface PipelineStage { key: string; label: string; count: number }
export interface PipelineResult {
  stages: PipelineStage[];
  replyRate: number | null;      // % of people emailed who replied
  interviewRate: number | null;  // % of applications that reached a screen or interview
  bySource: { source: string; applied: number; interviews: number }[];
  hints: string[];
}

const INTERVIEW_STAGES = ["screening", "interview", "final", "offer"];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** All-time funnel from what is already stored: saved roles, applications, people contacted, replies, interviews, offers. */
export function buildPipeline(i: PipelineInput): PipelineResult {
  const applied = i.apps.filter((a) => a.status !== "skipped");
  const interviews = applied.filter((a) => INTERVIEW_STAGES.includes(a.stage ?? "")).length;
  const offers = applied.filter((a) => a.stage === "offer").length;
  const emailed = new Set(i.steps.filter((s) => s.channel === "email" && ["sent", "replied"].includes(s.status)).map((s) => s.contact_id));
  const linkedin = new Set(i.steps.filter((s) => s.channel === "linkedin_task" && s.status === "task_done").map((s) => s.contact_id));
  const contacted = new Set([...emailed, ...linkedin]);
  const replied = new Set(i.steps.filter((s) => s.status === "replied").map((s) => s.contact_id));
  const totalInterviews = interviews + i.referralInterviews;

  const sources = new Map<string, { applied: number; interviews: number }>();
  for (const a of applied) {
    const key = sourceLabel(a.board ?? "pasted");
    const row = sources.get(key) ?? { applied: 0, interviews: 0 };
    row.applied++;
    if (INTERVIEW_STAGES.includes(a.stage ?? "")) row.interviews++;
    sources.set(key, row);
  }

  const replyRate = pct(replied.size, emailed.size);
  const hints: string[] = [];
  if (!i.saved && !applied.length && !contacted.size) hints.push("Nothing tracked yet. Save a role or send a first email and this page fills in.");
  if (i.saved >= 10 && applied.length === 0) hints.push(`You saved ${i.saved} roles but applied to none. Pick your best five and apply this week.`);
  if (emailed.size >= 20 && (replyRate ?? 0) < 3) hints.push(`Under 3% replied after ${emailed.size} people emailed. Rework the first email (shorter, one proof point, one clear ask) before sending more.`);
  if (applied.length >= 15 && totalInterviews === 0) hints.push(`${applied.length} applications and no interviews. Apply to fewer, better-fit roles and pair each with a person to message.`);
  if (replied.size > 0 && totalInterviews === 0) hints.push("You have replies but no interviews yet. In your next message ask directly for a 15-minute call.");

  return {
    stages: [
      { key: "saved", label: "Roles saved", count: i.saved },
      { key: "applied", label: "Applications sent", count: applied.length },
      { key: "contacted", label: "People contacted", count: contacted.size },
      { key: "replied", label: "Replies", count: replied.size },
      { key: "interviews", label: "Interviews", count: totalInterviews },
      { key: "offers", label: "Offers", count: offers },
    ],
    replyRate,
    interviewRate: pct(interviews, applied.length),
    bySource: [...sources.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.interviews - a.interviews || b.applied - a.applied),
    hints,
  };
}
