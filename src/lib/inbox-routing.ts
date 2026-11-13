// Works out what a recruiter email is and which application it belongs to. Pure functions, tested without Gmail.
import { fromAddress } from "@/lib/outreach/limits";

export type MailKind = "invite" | "interview" | "assessment" | "offer" | "rejection" | "received" | "other";

export interface InboxMail { id: string; threadId: string; from: string; subject: string; date: string; snippet: string }
export interface AppRef { id: string; company: string; title: string; stage: string | null }
export interface RoutedMail extends InboxMail {
  kind: MailKind;
  app: AppRef | null;
  /** The stage this mail suggests, or null. Never applied without your tap. */
  suggestedStage: "screening" | "interview" | "offer" | "rejected" | null;
}

/** Calendar invitations in the last 30 days (interview invites arrive this way). */
export const INVITE_QUERY = 'in:inbox newer_than:30d (filename:ics OR subject:"invitation:" OR subject:"updated invitation:")';

/** The older search for job-related mail; the Replies page no longer uses it. */
export const INBOX_QUERY = 'in:inbox newer_than:30d (interview OR "your application" OR "thank you for applying" OR "next steps" OR assessment OR "we regret" OR "unfortunately" OR offer OR recruiter OR "move forward" OR "schedule a call")';

// Order matters: a rejection that mentions "interview" is still a rejection.
export function classifyMail(subject: string, snippet: string): MailKind {
  const t = `${subject} ${snippet}`.toLowerCase();
  if (/^(updated )?invitation:|has invited you|accepted:|declined:/.test(subject.trim().toLowerCase())) return "invite";
  if (/(unfortunately|regret to inform|not (be )?moving forward|not (be )?proceed|decided to (move|go) (forward )?with (other|another)|will not be (moving|proceeding)|position has been filled)/.test(t)) return "rejection";
  if (/(offer letter|pleased to offer|happy to offer|we'd like to offer|extend (you )?an offer|job offer)/.test(t)) return "offer";
  if (/(interview|schedule a (call|chat|time)|availability|speak with you|meet with (our|the) team|phone screen|intro call)/.test(t)) return "interview";
  if (/(assessment|coding test|take-?home|case study|complete (the|this) (task|test))/.test(t)) return "assessment";
  if (/(thank you for applying|we('ve| have) received your application|application received|thanks for your interest)/.test(t)) return "received";
  return "other";
}

const SUGGEST: Record<MailKind, RoutedMail["suggestedStage"]> = {
  invite: "interview", interview: "interview", assessment: "screening", offer: "offer", rejection: "rejected", received: null, other: null,
};

const STOP = new Set(["inc", "ltd", "llc", "limited", "pvt", "private", "technologies", "technology", "solutions", "group", "the", "and", "co", "corp", "company", "labs", "software", "global"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** How strongly a mail points at one application: company words in sender, subject or snippet, plus the job title. */
function scoreMatch(mail: InboxMail, app: AppRef): number {
  const company = words(app.company);
  if (company.length === 0) return 0;
  const sender = `${mail.from} ${fromAddress(mail.from).split("@")[1] ?? ""}`.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const body = `${mail.subject} ${mail.snippet}`.toLowerCase();
  let score = 0;
  const joined = company.join("");
  if (joined && sender.replace(/ /g, "").includes(joined)) score += 5;
  for (const w of company) {
    if (sender.includes(w)) score += 3;
    if (body.includes(w)) score += 2;
  }
  if (score === 0) return 0;
  const titleWords = words(app.title);
  if (titleWords.length && titleWords.every((w) => body.includes(w))) score += 2;
  return score;
}

/** The single application a mail belongs to, or null when no application stands out clearly. */
export function matchApplication(mail: InboxMail, apps: AppRef[]): AppRef | null {
  const ranked = apps.map((a) => ({ a, s: scoreMatch(mail, a) })).filter((x) => x.s >= 3).sort((x, y) => y.s - x.s);
  if (ranked.length === 0) return null;
  // Two applications at the same company with equal scores: do not guess.
  if (ranked.length > 1 && ranked[0].s === ranked[1].s && ranked[0].a.company === ranked[1].a.company && ranked[0].s < 9) return ranked[0].a;
  if (ranked.length > 1 && ranked[0].s === ranked[1].s && ranked[0].a.company !== ranked[1].a.company) return null;
  return ranked[0].a;
}

const RANK: Record<string, number> = { applied: 0, screening: 1, interview: 2, final: 3, offer: 4 };

export function routeMails(mails: InboxMail[], apps: AppRef[]): RoutedMail[] {
  return mails.map((m) => {
    const kind = classifyMail(m.subject, m.snippet);
    const app = matchApplication(m, apps);
    let suggested = SUGGEST[kind];
    // Do not suggest moving backwards, or repeat the stage it is already in.
    if (app && suggested && suggested !== "rejected") {
      if ((RANK[app.stage ?? "applied"] ?? 0) >= RANK[suggested]) suggested = null;
    }
    if (app && suggested === "rejected" && app.stage === "rejected") suggested = null;
    return { ...m, kind, app, suggestedStage: app ? suggested : null };
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || 0);
}

export const KIND_LABEL: Record<MailKind, string> = {
  invite: "Invite", interview: "Interview", assessment: "Assessment", offer: "Offer", rejection: "Not moving forward", received: "Received", other: "Other",
};

/** Keep only mail that belongs on the Replies page: replies in threads you sent from Backchannel, and calendar invites. Newest first, no repeats. */
export function keepRepliesAndInvites(replies: InboxMail[], invites: InboxMail[]): InboxMail[] {
  const seen = new Set<string>();
  return [...replies, ...invites].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}
