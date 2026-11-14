import type { SupabaseClient } from "@supabase/supabase-js";
import { goalProgress, todayCards, waitingList, type TodayCard, type WaitingItem } from "@/lib/today-plan";
import { cleanSteps } from "@/lib/target-plan";
import { weeklySummary, type WeeklySummary, type WeekFacts } from "@/lib/application-status";
import { formatCompanyName } from "@/lib/company-name";

export interface TodayData {
  cards: TodayCard[];
  waiting: WaitingItem[];
  week: WeeklySummary;
  messagesThisWeek: number;
  goal: { done: number; goal: number; percent: number };
}

interface Priority { company: string; title: string }

/** Everything the Home "today" section shows. Any table that is missing counts as empty, so Home always loads. */
export async function loadToday(db: SupabaseClient, uid: string, apps: WeekFacts[], priorityJob: Priority | null): Promise<TodayData> {
  const [targets, drafts, sent, submitted] = await Promise.all([
    db.from("targets").select("company, title, strategy, steps").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
    db.from("outreach").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "draft"),
    db.from("outreach").select("sent_at, subject, contacts(name, company_name)").eq("user_id", uid).eq("status", "sent").order("sent_at", { ascending: false }).limit(15),
    db.from("applications").select("submitted_at, jobs(title, company_name, companies(name))").eq("user_id", uid).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(15),
  ]);

  const topTarget = ((targets.data ?? []) as { company: string; title: string; strategy: string; steps: unknown }[])
    .find((t) => t.strategy !== "apply_now" && !cleanSteps(t.steps).referral && t.company);

  const waiting = waitingList([
    ...((sent.data ?? []) as unknown as { sent_at: string | null; subject: string | null; contacts: { name: string | null; company_name: string | null } | null }[]).map((m) => ({
      kind: "message" as const,
      label: `Message · ${m.contacts?.company_name ? formatCompanyName(m.contacts.company_name) : m.contacts?.name ?? m.subject ?? "someone"}`,
      sentAt: m.sent_at,
    })),
    ...((submitted.data ?? []) as unknown as { submitted_at: string | null; jobs: { title: string; company_name: string | null; companies: { name: string } | null } | null }[]).map((a) => ({
      kind: "application" as const,
      label: `Application · ${formatCompanyName(a.jobs?.companies?.name ?? a.jobs?.company_name ?? "")} ${a.jobs?.title ?? ""}`.trim(),
      sentAt: a.submitted_at,
    })),
  ]);

  const week = weeklySummary(apps);
  const weekAgo = Date.now() - 7 * 864e5;
  const messagesThisWeek = ((sent.data ?? []) as { sent_at: string | null }[]).filter((m) => m.sent_at && Date.parse(m.sent_at) >= weekAgo).length;
  const needsYou = apps.filter((a) => a.status === "needs_answer" || a.auto_status === "needs_you" || a.auto_status === "failed").length;
  const readyToSend = apps.filter((a) => a.status !== "submitted" && a.status !== "skipped" && a.status !== "needs_answer" && !["needs_you", "failed", "submitted"].includes(a.auto_status ?? "") && (a.stage === null || a.stage === "applied")).length;

  return {
    cards: todayCards({ topTarget: topTarget ? { company: formatCompanyName(topTarget.company), title: topTarget.title } : null, priorityJob, draftMessages: drafts.count ?? 0, needsYou, readyToSend }),
    waiting, week, messagesThisWeek, goal: goalProgress(week.sent),
  };
}
