import { buildQueue, type QueueContact, type QueueStep } from "@/lib/outreach/queue";

export type Outcome = "call_booked" | "referral" | "interview" | "declined" | null;
export type BoardStage = "toContact" | "waiting" | "replied" | "call" | "interview";

export interface BoardContact extends QueueContact<QueueStep> {
  title: string | null; company_name: string | null; outcome: Outcome;
}

export const STAGE_LABEL: Record<BoardStage, string> = {
  toContact: "To contact", waiting: "Waiting for a reply", replied: "Replied", call: "Call booked", interview: "Referral or interview",
};

/** Where one person sits. What you recorded (call, referral, interview) wins over what the messages show. */
export function stageOf(c: BoardContact): BoardStage | null {
  if (c.outcome === "declined") return null;
  if (c.outcome === "call_booked") return "call";
  if (c.outcome === "referral" || c.outcome === "interview") return "interview";
  if (c.steps.some((s) => s.status === "replied")) return "replied";
  const reached = c.steps.some((s) => (s.channel === "email" && s.status === "sent") || (s.channel === "linkedin_task" && s.status === "task_done"));
  if (reached) return "waiting";
  return c.steps.some((s) => ["draft", "scheduled", "failed", "task_open"].includes(s.status)) ? "toContact" : null;
}

/** People grouped by stage, plus today's follow-ups and anyone whose reply is waiting for your answer. */
export function buildBoard<C extends BoardContact>(contacts: C[], now = Date.now()) {
  const columns: Record<BoardStage, C[]> = { toContact: [], waiting: [], replied: [], call: [], interview: [] };
  for (const c of contacts) {
    const stage = stageOf(c);
    if (stage) columns[stage].push(c);
  }
  const q = buildQueue(contacts, now);
  const followUps = [...q.followUps.map((i) => i.contact), ...q.linkedin.map((i) => i.contact)];
  const dueIds = new Set(followUps.map((c) => c.id));
  const needsAnswer = columns.replied.filter((c) => !dueIds.has(c.id));
  return { columns, followUps: [...new Map(followUps.map((c) => [c.id, c])).values()], needsAnswer };
}
