import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { PageHeader, Card, Pill } from "@/components/ui";
import { trackOf, weeklyFunnel, type Track } from "@/lib/funnel";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

const MIN_SENDS_FOR_RATE = 10;

export default async function TodayPage() {
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const uid = user?.id ?? "";
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 864e5).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: scores }, { data: apps }, { data: steps }, { data: refs }, { data: events }, { data: profile }, { data: watch }, { data: gmail }] = await Promise.all([
    db.from("job_scores").select("score, reaction, scored_at, jobs!inner(id, title, url, location, market, is_active, created_at, company_name, companies(name))").eq("user_id", uid).eq("jobs.is_active", true).order("score", { ascending: false }).limit(300),
    db.from("applications").select("id, status, stage, jobs(title)").eq("user_id", uid),
    db.from("outreach").select("id, status, channel, scheduled_for").eq("user_id", uid),
    db.from("referrals").select("id, stage, follow_up_on").eq("user_id", uid),
    db.from("funnel_events").select("type, occurred_at").eq("user_id", uid).gte("occurred_at", twoWeeksAgo),
    db.from("profiles").select("cv_text, name, markets").eq("user_id", uid).maybeSingle(),
    db.from("watchlist").select("company_id").eq("user_id", uid).eq("watching", true),
    serviceClient().from("gmail_accounts").select("user_id").eq("user_id", uid).maybeSingle(),
  ]);

  type S = { score: number | null; reaction: string | null; jobs: { id: string; title: string; url: string; location: string; market: string | null; company_name: string | null; created_at: string; companies: { name: string } | null } };
  const sc = (scores ?? []) as unknown as S[];
  const highFit = sc.filter((s) => (s.score ?? 0) >= 75 && s.reaction !== "skipped");
  const freshAll = sc.filter((s) => s.jobs.created_at >= weekAgo && s.reaction !== "skipped");
  const tracks: { id: Track; label: string; hint: string }[] = [
    { id: "fast", label: "Fast track", hint: "India and Gulf: quicker hiring" },
    { id: "stretch", label: "Stretch track", hint: "US, UK, Europe, remote: higher pay, harder to land" },
  ];
  const byTrack = (t: Track) => {
    const all = sc.filter((s) => s.reaction !== "skipped" && trackOf(s.jobs.market) === t);
    return { strong: all.filter((s) => (s.score ?? 0) >= 75).length, fresh: freshAll.filter((s) => trackOf(s.jobs.market) === t).slice(0, 4) };
  };
  const wf = weeklyFunnel(events ?? []);
  const a = apps ?? [];
  const o = steps ?? [];
  const r = refs ?? [];

  const setup = [
    { done: !!profile?.cv_text, label: "Upload your CV", why: "so matching, applications and emails use your real numbers", href: "/profile" },
    { done: !!profile?.name && (profile?.markets?.length ?? 0) > 0, label: "Fill in your scorecard", why: "your name, target markets and minimum pay", href: "/profile" },
    { done: (watch ?? []).length > 0, label: "Pick companies to watch", why: "so new roles at them reach you first", href: "/companies" },
    { done: !!gmail, label: "Connect your Gmail", why: "so you can send emails and see replies in one place", href: "/outreach" },
  ];
  const setupLeft = setup.filter((s) => !s.done);

  const nowIso = new Date().toISOString();
  const todo: { text: string; cta: string; href: string; tone: "warn" | "signal" | "accent" }[] = [];
  const needAns = a.filter((x) => x.status === "needs_answer").length;
  if (needAns) todo.push({ text: `Confirm your answers on ${plural(needAns, "application")} (visa, salary, notice period)`, cta: "Confirm", href: "/autopilot", tone: "warn" });
  const ready = a.filter((x) => x.status === "awaiting_approval").length;
  if (ready) todo.push({ text: `Review and submit ${plural(ready, "prepared application")}`, cta: "Review", href: "/autopilot", tone: "signal" });
  const drafts = o.filter((x) => x.channel === "email" && x.status === "draft" && x.scheduled_for && x.scheduled_for <= nowIso).length;
  if (drafts) todo.push({ text: `Approve ${plural(drafts, "email")} waiting for you`, cta: "Approve", href: "/outreach", tone: "signal" });
  const li = o.filter((x) => x.channel === "linkedin_task" && x.status === "task_open" && x.scheduled_for && x.scheduled_for <= nowIso).length;
  if (li) todo.push({ text: `Send ${plural(li, "LinkedIn message")} yourself`, cta: "Open", href: "/outreach", tone: "signal" });
  const fu = r.filter((x) => x.follow_up_on && x.follow_up_on <= today && !["referred", "interview", "declined"].includes(x.stage)).length;
  if (fu) todo.push({ text: `Follow up on ${plural(fu, "referral ask", "referral asks")}`, cta: "Follow up", href: "/referrals", tone: "signal" });
  const appliedTitles = new Set(a.map((x) => (x as unknown as { jobs?: { title: string } }).jobs?.title));
  const toReview = highFit.filter((s) => !appliedTitles.has(s.jobs.title)).length;
  if (toReview) todo.push({ text: `Review ${plural(toReview, "strong match", "strong matches")} and pick who to ask for a referral`, cta: "Review", href: "/roles", tone: "accent" });

  const week = [
    ["Applications", wf.thisWeek.applied, wf.lastWeek.applied],
    ["Emails sent", wf.thisWeek.sent, wf.lastWeek.sent],
    ["Replies", wf.thisWeek.replies, wf.lastWeek.replies],
    ["Referrals made", wf.thisWeek.referrals, wf.lastWeek.referrals],
    ["Interviews", wf.thisWeek.interviews, wf.lastWeek.interviews],
  ] as const;
  const rateText = wf.thisWeek.sent >= MIN_SENDS_FOR_RATE && wf.replyRate !== null
    ? `Reply rate: ${wf.replyRate}% (${wf.thisWeek.replies} of ${wf.thisWeek.sent} emails).`
    : `Reply rate appears after ${MIN_SENDS_FOR_RATE} emails (${wf.thisWeek.sent} sent this week).`;

  return (
    <section className="py-6">
      <PageHeader eyebrow="Today" title="What needs you today">
        Goal: {wf.goal.min} to {wf.goal.max} interviews a week. This week you have {wf.thisWeek.interviews}.
      </PageHeader>

      {setupLeft.length > 0 && (
        <Card className="mb-5 border-accent">
          <h2 className="text-xl font-bold">Get set up ({setup.length - setupLeft.length} of {setup.length} done)</h2>
          <p className="mt-1 text-sm text-muted">Four quick steps, about 10 minutes. Scores and drafts get better with each one.</p>
          <ol className="mt-3 flex flex-col gap-2">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className={`flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-accent ${s.done ? "opacity-60" : ""}`}>
                  <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-good text-accent-ink" : "border border-line text-muted"}`}>{s.done ? "✓" : ""}</span>
                  <span className="text-sm"><b>{s.label}</b> <span className="text-muted">{s.why}</span></span>
                  <span className="sr-only">{s.done ? "Done" : "Not done yet"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="mb-5">
        <h2 className="mb-3 text-xl font-bold">To do now</h2>
        {todo.length ? (
          <ul className="flex flex-col gap-2">
            {todo.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-accent">
                  <span className="text-sm">{t.text}</span>
                  <Pill tone={t.tone}>{t.cta} →</Pill>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You&apos;re caught up. Next: add someone you&apos;d like a referral from on <Link href="/referrals" className="font-semibold text-accent">Referrals</Link>. New roles arrive every morning.</p>
        )}
      </Card>

      <Card className="mb-5">
        <h2 className="mb-1 text-xl font-bold">This week</h2>
        <p className="mb-3 text-sm text-muted">{rateText}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {week.map(([label, now, before]) => {
            const delta = now - before;
            return (
              <div key={label} className="rounded-lg bg-sunk p-3">
                <b className={`block font-display text-2xl num ${now ? "" : "text-muted"}`}>{now}</b>
                <span className="text-xs text-muted">{label}</span>
                <span className={`mt-0.5 block text-xs num ${delta > 0 ? "text-good" : "text-muted"}`}>{delta > 0 ? `+${delta} vs last week` : delta < 0 ? `${delta} vs last week` : "same as last week"}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {tracks.map((t) => {
          const d = byTrack(t.id);
          return (
            <Card key={t.id}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold">{t.label}</h2>
                <span className="text-sm text-muted">{plural(d.strong, "strong match", "strong matches")} (75%+)</span>
              </div>
              <p className="mb-2 text-xs text-muted">{t.hint}</p>
              {d.fresh.length ? <ul className="flex flex-col divide-y divide-line">{d.fresh.map((s) => (
                <li key={s.jobs.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <a href={s.jobs.url} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:underline"><b>{s.jobs.title}</b> <span className="text-muted">· {s.jobs.companies?.name ?? s.jobs.company_name} · {s.jobs.location}</span></a>
                  <Pill tone="accent">Fit {s.score}%</Pill>
                </li>
              ))}</ul> : <p className="text-sm text-muted">No new roles this week on this track.</p>}
              <Link href="/roles" className="mt-3 inline-block text-sm font-semibold text-accent">All roles →</Link>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
