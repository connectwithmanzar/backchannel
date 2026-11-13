// One tap to apply: prepare the application, then send it by the fastest route that works, with no review screen.
// It never answers a visa, salary, notice-period or similar question for you (hard rule 4): when one is unanswered it stops
// and says so. This file holds only the decisions, so it is tested without a network. The screens pass in the caller.

export interface CallResult { status: number; data: Record<string, unknown> }
export type ApplicationsCall = (body: Record<string, unknown>) => Promise<CallResult>;

export type ApplyOutcome =
  | { kind: "submitted"; id: string; how: string }
  | { kind: "queued"; id: string }
  | { kind: "needs_you"; id: string | null; message: string }
  | { kind: "failed"; message: string };

const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

/**
 * 1. prepare: builds the tailored CV, cover note and answers.
 * 2. a sensitive question with no saved answer: stop, you are needed.
 * 3. direct submit to the company's job system, when it supports that.
 * 4. otherwise hand it to the auto-apply robot on your Mac.
 * 5. otherwise say what is needed.
 */
export async function oneTapApply(jobId: string, call: ApplicationsCall): Promise<ApplyOutcome> {
  let prepared: CallResult;
  try { prepared = await call({ action: "prepare", job_id: jobId }); } catch { return { kind: "failed", message: "Couldn't reach the server. Check your connection." }; }
  if (prepared.status >= 400) return { kind: "failed", message: text(prepared.data.error, "Couldn't prepare that application.") };

  const id = typeof prepared.data.id === "string" ? prepared.data.id : null;
  if (!id) return { kind: "failed", message: "Couldn't prepare that application." };
  if (prepared.data.status === "needs_answer") {
    return { kind: "needs_you", id, message: "A question needs your own answer first (visa, salary or notice period). Open the job to answer it once." };
  }

  let direct: CallResult;
  try { direct = await call({ action: "direct_auto_apply", id }); } catch { return { kind: "failed", message: "Couldn't reach the server. Check your connection." }; }
  if (direct.status < 400 && direct.data.ok === true) {
    return { kind: "submitted", id, how: text(direct.data.method, "the company's job system") };
  }

  // Direct sending is not supported for this company's system (or it failed): the robot browser can try.
  let queued: CallResult;
  try { queued = await call({ action: "queue_auto", id }); } catch { return { kind: "failed", message: "Couldn't reach the server. Check your connection." }; }
  if (queued.status < 400 && queued.data.ok === true) return { kind: "queued", id };
  return { kind: "needs_you", id, message: text(queued.data.error, text(direct.data.error, "This one has to be sent by you. Open the job to finish it.")) };
}

export const OUTCOME_TEXT: Record<ApplyOutcome["kind"], string> = {
  submitted: "Applied",
  queued: "Queued for the auto-apply robot",
  needs_you: "Needs you",
  failed: "Couldn't apply",
};

/** The short line shown after a tap. */
export function outcomeLine(o: ApplyOutcome): string {
  switch (o.kind) {
    case "submitted": return `Applied through ${o.how}.`;
    case "queued": return "Queued: your Mac's auto-apply robot will send it.";
    case "needs_you": return o.message;
    case "failed": return o.message;
  }
}
