// The first-run checklist: what is set up, what is not, and what to do next. Pure functions, tested without a database.

export interface SetupFacts {
  hasCv: boolean;
  targetTitles: number;
  markets: number;
  hasPayFloor: boolean;
  savedAnswers: number;
  gmailConnected: boolean;
  autoApplyMode: "off" | "dry_run" | "submit";
  applicationCount: number;
}

export interface SetupStep {
  id: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  done: boolean;
  /** Required steps must be done before the app counts you as set up. */
  required: boolean;
}

export function buildSteps(f: SetupFacts): SetupStep[] {
  return [
    { id: "cv", title: "Upload your CV", why: "Every application is tailored from it, so this comes first.", href: "/profile", cta: "Add your CV", done: f.hasCv, required: true },
    { id: "roles", title: "Choose the roles and places you want", why: "Matches, swipe cards and auto-apply only use roles that fit these.", href: "/profile", cta: "Pick roles and markets", done: f.targetTitles > 0 && f.markets > 0, required: true },
    { id: "pay", title: "Set your minimum pay", why: "Roles that state pay below your floor are marked down.", href: "/profile", cta: "Set minimum pay", done: f.hasPayFloor, required: false },
    { id: "answers", title: "Save your visa, salary and notice-period answers", why: "These are never guessed. Saved once, they let applications go out without stopping to ask.", href: "/autopilot", cta: "Save your answers", done: f.savedAnswers > 0, required: true },
    { id: "gmail", title: "Connect Gmail", why: "So replies from companies show up in your Inbox, matched to the right application.", href: "/outreach", cta: "Connect Gmail", done: f.gmailConnected, required: false },
    { id: "auto", title: "Turn on auto-apply", why: "Applications that can't be sent directly go to the robot on your Mac. Start with Practice if you like.", href: "/autopilot", cta: "Set up auto-apply", done: f.autoApplyMode !== "off", required: false },
    { id: "swipe", title: "Swipe your first role", why: "Pass, save or apply. Apply sends the application, with a few seconds to undo.", href: "/swipe", cta: "Start swiping", done: f.applicationCount > 0, required: false },
  ];
}

export interface SetupProgress {
  done: number;
  total: number;
  percent: number;
  /** The first step still to do, required ones first. Null when everything is done. */
  next: SetupStep | null;
  /** True when every required step is done. */
  ready: boolean;
}

export function progressOf(steps: SetupStep[]): SetupProgress {
  const done = steps.filter((s) => s.done).length;
  const todo = steps.filter((s) => !s.done);
  const next = todo.find((s) => s.required) ?? todo[0] ?? null;
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 0, next, ready: steps.filter((s) => s.required).every((s) => s.done) };
}
