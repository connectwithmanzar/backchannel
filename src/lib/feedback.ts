// A light, explainable learning step: what you skip or save at a company nudges other roles at that company.
// Nothing is hidden and nothing is trained. The change is capped and written into the explanation.
export interface Rankable { id: string; company: string; score: number; explanation: string }

const POSITIVE = new Set(["bookmarked", "applied"]);

export function applyFeedback<T extends Rankable>(jobs: T[], reactions: Record<string, { reaction: string | null } | undefined>): T[] {
  const tally = new Map<string, { skipped: number; liked: number }>();
  for (const j of jobs) {
    const r = reactions[j.id]?.reaction;
    if (!r) continue;
    const t = tally.get(j.company) ?? { skipped: 0, liked: 0 };
    if (r === "skipped") t.skipped++;
    else if (POSITIVE.has(r)) t.liked++;
    tally.set(j.company, t);
  }
  return jobs.map((j) => {
    const t = tally.get(j.company);
    if (!t || reactions[j.id]?.reaction) return j;            // roles you already reacted to are left alone
    let adjust = 0;
    let note = "";
    if (t.skipped >= 2 && t.skipped > t.liked) {
      adjust = -Math.min(15, 5 * (t.skipped - t.liked));
      note = ` Lowered by ${-adjust} because you skipped ${t.skipped} other roles at ${j.company}.`;
    } else if (t.liked > 0 && t.liked >= t.skipped) {
      adjust = Math.min(10, 5 * t.liked);
      note = ` Raised by ${adjust} because you saved or applied to ${t.liked} other ${t.liked === 1 ? "role" : "roles"} at ${j.company}.`;
    }
    return adjust ? { ...j, score: Math.max(0, Math.min(100, j.score + adjust)), explanation: j.explanation + note } : j;
  });
}
