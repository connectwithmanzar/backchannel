// Approved email templates. Only these fixed merge fields are ever filled in, so an auto-sent
// email contains the owner's own approved words and nothing generated.
export const OPT_OUT = "If this isn't relevant, just reply \"no\" and I won't follow up.";
export const MERGE_FIELDS = ["first_name", "company", "role_title", "sender_name"] as const;
export type MergeValues = Record<(typeof MERGE_FIELDS)[number], string>;

export const MAX_SUBJECT = 120;
export const MAX_BODY = 1500;

export function unknownFields(text: string): string[] {
  const found = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((f) => !(MERGE_FIELDS as readonly string[]).includes(f)))];
}

/** Returns a plain-language problem, or null when the template is fine to save. */
export function validateTemplate(subject: string, body: string): string | null {
  if (!subject.trim() || !body.trim()) return "Add both a subject and a message.";
  if (subject.length > MAX_SUBJECT) return `Keep the subject under ${MAX_SUBJECT} characters.`;
  if (body.length > MAX_BODY) return `Keep the message under ${MAX_BODY} characters.`;
  const bad = unknownFields(`${subject}\n${body}`);
  if (bad.length) return `These fields aren't allowed: ${bad.map((b) => `{${b}}`).join(", ")}. Allowed: ${MERGE_FIELDS.map((f) => `{${f}}`).join(", ")}.`;
  return null;
}

export function renderTemplate(t: { subject: string; body: string }, v: MergeValues, signature?: string | null) {
  const fill = (s: string) => s.replace(/\{([a-z_]+)\}/g, (m, k: string) => ((MERGE_FIELDS as readonly string[]).includes(k) ? v[k as keyof MergeValues] : m));
  const body = fill(t.body).trim();
  const sig = signature?.trim();
  return { subject: fill(t.subject).trim(), body: `${body}${sig ? `\n\n${sig}` : ""}${body.includes(OPT_OUT) ? "" : `\n\n${OPT_OUT}`}` };
}

export interface AutoSendInput {
  enabled: boolean;
  templateApproved: boolean;
  fit: number | null;
  minFit: number;
  rampStart: string | null;
  recipientName: string;
  now?: number;
}

export const MANUAL_WEEK_DAYS = 7;

/** Auto-send is allowed only when everything lines up. Anything else stays a draft for the owner to approve. */
export function autoSendDecision(i: AutoSendInput): { auto: boolean; reason: string } {
  const now = i.now ?? Date.now();
  if (!i.enabled) return { auto: false, reason: "Auto-send is off" };
  if (!i.templateApproved) return { auto: false, reason: "No approved template" };
  if (i.fit === null || i.fit < i.minFit) return { auto: false, reason: "Fit is below your auto-send minimum" };
  if (!i.rampStart || now - Date.parse(i.rampStart) < MANUAL_WEEK_DAYS * 864e5) return { auto: false, reason: "The first week every email needs your approval" };
  if (!i.recipientName.trim() || i.recipientName.includes("*")) return { auto: false, reason: "The recipient's full name isn't known" };
  return { auto: true, reason: "ok" };
}
