export type Angle = "role" | "referral" | "person";

export const ANGLES: { id: Angle; label: string; ask: string }[] = [
  { id: "role", label: "About the role", ask: "Ask directly whether the role is still open and worth applying for. A one-line answer is enough." },
  { id: "referral", label: "A referral", ask: "Ask whether they would be open to referring you or introducing you to the hiring manager. Make saying no easy." },
  { id: "person", label: "The right person", ask: "Ask who is the right person to talk to about sales hiring there. Make it easy to just name someone." },
];

export const isAngle = (v: unknown): v is Angle => v === "role" || v === "referral" || v === "person";

const OPT_OUT_RE = /not relevant|will not write again|opt[- ]?out|unsubscribe|don't want|do not want/i;

/** Words in the message, not counting the opt-out line or the signature block after the sign-off. */
export function wordCount(body: string): number {
  const text = body.split("\n").filter((l) => !OPT_OUT_RE.test(l)).join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** Three short subject lines built from facts we already have. Short and plain tends to be read. */
export function subjectOptions(o: { firstName: string; company: string; role?: string | null }): string[] {
  const first = o.firstName.trim().split(/\s+/)[0] || "";
  const role = (o.role ?? "").trim();
  const options = [
    first ? `${first}, quick question` : "Quick question",
    role ? `${role} at ${o.company}` : `Sales roles at ${o.company}`,
    `Your sales team at ${o.company}`,
  ];
  return [...new Set(options.map((s) => s.slice(0, 60)))];
}

export interface Check { id: string; label: string; ok: boolean }

export function messageChecks(m: { subject: string; body: string; company: string; firstName?: string }): { words: number; checks: Check[] } {
  const words = wordCount(m.body);
  const body = m.body.toLowerCase();
  const asks = (m.body.match(/\?/g) ?? []).length;
  const checks: Check[] = [
    { id: "specific", label: "Names a specific reason", ok: body.includes(m.company.toLowerCase().split(/\s+/)[0]) },
    { id: "ask", label: "One clear ask", ok: asks >= 1 && asks <= 2 },
    { id: "length", label: "Under 100 words", ok: words > 0 && words <= 100 },
    { id: "plain", label: "No attachment, no link", ok: !/https?:\/\/|www\.|attached|attachment/i.test(m.body) },
    { id: "subject", label: "Short subject (40 characters or fewer)", ok: m.subject.trim().length > 0 && m.subject.trim().length <= 40 },
    { id: "optout", label: "Opt-out line included", ok: OPT_OUT_RE.test(m.body) },
  ];
  return { words, checks };
}
