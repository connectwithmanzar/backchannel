// An itemised receipt for a sent application: where it went, what was attached, and each answer given.
// Only facts Backchannel stored are listed. It never claims a field was filled unless an answer is on record.

export interface ReceiptInput {
  url: string | null;
  status: string | null;
  auto_status: string | null;
  submitted_at: string | null;
  receipt: string | null;
  tailored_cv: string | null;
  cover_note: string | null;
  questions: { q: string; answer: string; sensitive?: boolean }[] | null;
}

export interface ReceiptItem { label: string; detail: string; filled: boolean; fromSaved?: boolean }
export interface Receipt {
  provider: string;
  sentAt: string | null;
  confirmation: string | null;
  items: ReceiptItem[];
  filled: number;
  total: number;
}

const HOSTS: [RegExp, string][] = [
  [/greenhouse\.io/, "Greenhouse"], [/lever\.co/, "Lever"], [/ashbyhq\.com/, "Ashby"], [/myworkdayjobs\.com|workday/, "Workday"],
  [/workable\.com/, "Workable"], [/smartrecruiters\.com/, "SmartRecruiters"], [/recruitee\.com/, "Recruitee"], [/bamboohr\.com/, "BambooHR"],
  [/icims\.com/, "iCIMS"], [/jobvite\.com/, "Jobvite"], [/teamtailor\.com/, "Teamtailor"],
];

export function providerLabel(url: string | null | undefined): string {
  if (!url) return "the company's site";
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "the company's site"; }
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? "the company's own site";
}

/** True when there is something to show: the application was sent, or the robot filled the form. */
export function hasReceipt(a: Pick<ReceiptInput, "status" | "auto_status">): boolean {
  return a.status === "submitted" || a.auto_status === "submitted" || a.auto_status === "filled";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function buildReceipt(a: ReceiptInput): Receipt | null {
  if (!hasReceipt(a)) return null;
  const cv = !!a.tailored_cv?.trim();
  const note = !!a.cover_note?.trim();
  const items: ReceiptItem[] = [
    { label: "CV", detail: cv ? "Tailored for this role (ATS-friendly PDF)" : "Your standard CV", filled: true },
    { label: "Cover note", detail: note ? clip(a.cover_note!.trim().replace(/\s+/g, " "), 140) : "None attached", filled: note },
  ];
  for (const q of a.questions ?? []) {
    const answer = (q.answer ?? "").trim();
    items.push({ label: clip(q.q, 90), detail: answer ? clip(answer.replace(/\s+/g, " "), 140) : "No answer on record", filled: !!answer, fromSaved: !!q.sensitive && !!answer });
  }
  const filled = items.filter((i) => i.filled).length;
  return {
    provider: providerLabel(a.url), sentAt: a.submitted_at, confirmation: a.receipt?.trim() || null,
    items, filled, total: items.length,
  };
}
