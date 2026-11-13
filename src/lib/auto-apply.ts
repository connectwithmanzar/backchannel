// Auto-apply rules, kept free of server code so the page, the API and the tests all use the same logic.
import type { AppQuestion } from "@/lib/apps/prepare";

export const AUTO_MODES = ["off", "dry_run", "submit"] as const;
export type AutoMode = (typeof AUTO_MODES)[number];

export const AUTO_RESULTS = ["filled", "submitted", "needs_you", "failed"] as const;
export type AutoResult = (typeof AUTO_RESULTS)[number];

export const MAX_AUTO_CAP = 100;
export const DEFAULT_AUTO_CAP = 20;
/** A "running" job that has not reported back for this long is handed out again. */
export const RUNNING_TIMEOUT_MS = 30 * 60 * 1000;

/** Details forms ask for that are not sensitive. Stored with the saved answers. */
export const CONTACT_FIELDS: Record<string, string> = {
  contact_phone: "Phone number (with country code)",
  contact_linkedin: "LinkedIn profile link",
  contact_website: "Website or portfolio link (optional)",
  contact_city: "Current city and country",
};

export const MODE_LABELS: Record<AutoMode, string> = {
  off: "Off",
  dry_run: "Practice: fill the form, do not send",
  submit: "Send applications",
};

export const cleanAutoMode = (v: unknown): AutoMode => ((AUTO_MODES as readonly string[]).includes(String(v)) ? (v as AutoMode) : "off");
export const isAutoResult = (v: unknown): v is AutoResult => (AUTO_RESULTS as readonly string[]).includes(String(v));

export function clampAutoCap(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_AUTO_CAP;
  return Math.max(1, Math.min(MAX_AUTO_CAP, Math.round(n)));
}

export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export const unansweredSensitive = (questions: AppQuestion[]): AppQuestion[] => questions.filter((q) => q.sensitive && !q.answer.trim());

/** With standing approval, fills sensitive questions from your saved answers. It never guesses: a question with no saved answer stays empty. */
export function fillSavedAnswers(questions: AppQuestion[], saved: Record<string, string>, useSaved: boolean): AppQuestion[] {
  if (!useSaved) return questions;
  return questions.map((q) => {
    if (!q.sensitive || q.answer.trim() || !q.key) return q;
    const answer = (saved[q.key] ?? "").trim();
    return answer ? { ...q, answer } : q;
  });
}

export interface QueueCheck { ok: boolean; reason?: string; questions: AppQuestion[] }

/** Can this prepared application go to the robot browser? Every sensitive question needs an answer you gave. */
export function checkQueueable(app: { status: string; questions: AppQuestion[] | null }, mode: AutoMode, useSaved: boolean, saved: Record<string, string>): QueueCheck {
  const questions = fillSavedAnswers(app.questions ?? [], saved, useSaved);
  if (mode === "off") return { ok: false, reason: "Auto-apply is switched off. Turn it on in Applications → Settings.", questions };
  if (app.status === "submitted") return { ok: false, reason: "You already applied to this job.", questions };
  if (app.status === "skipped") return { ok: false, reason: "You skipped this application.", questions };
  const missing = unansweredSensitive(questions);
  if (missing.length > 0) {
    return { ok: false, reason: `Answer these first (the robot never guesses them): ${missing.map((q) => q.q).join("; ")}`, questions };
  }
  return { ok: true, questions };
}

export const remainingToday = (cap: number, doneToday: number): number => Math.max(0, cap - doneToday);

export interface FormProfile {
  full_name: string; first_name: string; last_name: string; email: string; phone: string; location: string;
  linkedin_url: string; website: string; cv_text: string;
}

/** The details a form needs, from your profile, sign-in email and saved answers. */
export function buildFormProfile(profile: { name?: string | null; cv_text?: string | null } | null, email: string, saved: Record<string, string>): FormProfile {
  const full = (profile?.name ?? "").trim();
  const { first, last } = splitName(full);
  const get = (k: string) => (saved[k] ?? "").trim();
  return {
    full_name: full, first_name: first, last_name: last, email: email.trim(),
    phone: get("contact_phone"), location: get("contact_city"), linkedin_url: get("contact_linkedin"), website: get("contact_website"),
    cv_text: profile?.cv_text ?? "",
  };
}

/** What is missing before a form can be filled for you. */
export function missingProfileDetails(p: FormProfile): string[] {
  const out: string[] = [];
  if (!p.full_name) out.push("your name (on your profile)");
  if (!p.email) out.push("your email");
  if (!p.phone) out.push("phone number");
  if (!p.location) out.push("current city and country");
  if (p.cv_text.length < 200) out.push("your CV (on your profile)");
  return out;
}

/** True when a "running" job has been stuck long enough to hand out again. */
export const isStale = (autoAt: string | null, now = Date.now()): boolean => !autoAt || now - new Date(autoAt).getTime() > RUNNING_TIMEOUT_MS;
