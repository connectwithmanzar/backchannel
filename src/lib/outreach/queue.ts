export interface QueueStep { id: string; step_index: number; channel: "email" | "linkedin_task"; status: string; scheduled_for: string | null }
export interface QueueContact<S extends QueueStep = QueueStep> { id: string; name: string; steps: S[] }
type StepOf<C> = C extends { steps: (infer S)[] } ? S : QueueStep;
export interface QueueItem<C extends QueueContact<QueueStep>> { contact: C; step: StepOf<C> }

export interface Queue<C extends QueueContact<QueueStep>> {
  needsOk: QueueItem<C>[];   // a first email written and waiting for your OK
  followUps: QueueItem<C>[]; // a later email whose day has come, after the first one went out
  linkedin: QueueItem<C>[];  // a LinkedIn message due, for you to send by hand
  replied: C[];
  waiting: C[];              // first email sent, nothing due yet
}

const OPEN = ["draft", "scheduled", "failed"];
const due = (s: QueueStep, now: number) => !s.scheduled_for || new Date(s.scheduled_for).getTime() <= now;

/**
 * Sorts every person's next step into the part of the day it belongs to. Replied people never show as work to do,
 * and a follow-up only appears once the first email has actually been sent.
 */
export function buildQueue<C extends QueueContact<QueueStep>>(contacts: C[], now = Date.now()): Queue<C> {
  const q: Queue<C> = { needsOk: [], followUps: [], linkedin: [], replied: [], waiting: [] };
  for (const c of contacts) {
    if (c.steps.some((s) => s.status === "replied")) { q.replied.push(c); continue; }
    if (c.steps.length && c.steps.every((s) => ["stopped", "task_done", "sent"].includes(s.status)) && !c.steps.some((s) => s.status === "sent")) continue;
    const firstEmail = c.steps.find((s) => s.channel === "email" && s.step_index === 0);
    const firstSent = firstEmail?.status === "sent";
    let hasWork = false;
    for (const s of [...c.steps].sort((a, b) => a.step_index - b.step_index)) {
      if (s.channel === "email" && s.step_index === 0 && OPEN.includes(s.status)) { q.needsOk.push({ contact: c, step: s as StepOf<C> }); hasWork = true; }
      else if (s.channel === "email" && s.step_index > 0 && OPEN.includes(s.status) && firstSent && due(s, now)) { q.followUps.push({ contact: c, step: s as StepOf<C> }); hasWork = true; }
      else if (s.channel === "linkedin_task" && s.status === "task_open" && due(s, now)) { q.linkedin.push({ contact: c, step: s as StepOf<C> }); hasWork = true; }
    }
    if (!hasWork && c.steps.some((s) => s.status === "sent" || s.status === "scheduled")) q.waiting.push(c);
  }
  return q;
}

export const todoCount = (q: Queue<QueueContact<QueueStep>>) => q.needsOk.length + q.followUps.length + q.linkedin.length;
