import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Pill } from "@/components/ui";
import { trackOf, weeklyFunnel, type Track } from "@/lib/funnel";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 864e5).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [{ count: activeRoles }, { data: scores }, { data: apps }, { data: steps }, { data: refs }, { data: events }, { data: profile }, { data: watch }] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("job_scores").select("score, reaction, scored_at, jobs!inner(id, title, url, location, market, is_active, created_at, companies(name))").eq("user_id", uid).eq("jobs.is_active", true).order("score", { ascending: false }).limit(300),
    db.from("applications").select("id, status, stage, jobs(title, companies(name))").eq("user_id", uid),
    db.from("outreach").select("id, status, channel, scheduled_for, contacts(name, company_name)").eq("user_id", uid),
    db.from("referrals").select("id, referrer_name, company_name, stage, follow_up_on").eq("user_id", uid),
    db.from("funnel_events").select("type, occurred_at").eq("user_id", uid).gte("occurred_at", twoWeeksAgo),
    db.from("profiles").select("cv_text, tools").eq("user_id", uid).maybeSingle(),
    db.from("watchlist").select("company_id").eq("user_id", uid).eq("watching", true),
  ]);

  type S = { score: number | null; reaction: string | null; jobs: { id: string; title: string; url: string; location: string; market: string | null; created_at: string; companies: { name: string } | null } };
  const sc = (scores ?? []) as unknown as S[];
  const highFit = sc.filter((s) => (s.score ?? 0) >= 75);
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
  const ev = (events ?? []).filter((e) => e.occurred_at >= weekAgo);
  const count = (t: string) => ev.filter((e) => e.type === t).length;

  const funnel = [
    ["Open roles tracked", activeRoles ?? 0, "/roles"],
    ["Strong matches (75%+)", highFit.length, "/roles"],
    ["Applications submitted", a.filter((x) => x.status === "submitted").length, "/autopilot"],
    ["Emails sent", o.filter((x) => x.channel === "email" && ["sent", "replied"].includes(x.status)).length, "/outreach"],
    ["Replies", o.filter((x) => x.status === "replied").length, "/outreach"],
    ["Referrals made", r.filter((x) => ["referred", "interview"].includes(x.stage)).length, "/referrals"],
    ["Interviews", a.filter((x) => ["interview", "final", "offer"].includes(x.stage ?? "")).length + r.filter((x) => x.stage === "interview").length, "/autopilot"],
    ["Offers", a.filter((x) => x.stage === "offer").length, "/autopilot"],
  ] as const;

  const todo: { text: string; href: string; tone: "warn" | "signal" | "accent" }[] = [];
  if (!profile?.cv_text) todo.push({ text: "Upload your CV so matching, applications and emails use your real numbers", href: "/profile", tone: "warn" });
  const needAns = a.filter((x) => x.status === "needs_answer").length;
  if (needAns) todo.push({ text: `${needAns} application(s) need your answer (visa, salary or notice period)`, href: "/autopilot", tone: "warn" });
  const ready = a.filter((x) => x.status === "awaiting_approval").length;
  if (ready) todo.push({ text: `${ready} application(s) ready to review and submit`, href: "/autopilot", tone: "signal" });
  const drafts = o.filter((x) => x.channel === "email" && x.status === "draft" && x.scheduled_for && x.scheduled_for <= new Date().toISOString()).length;
  if (drafts) todo.push({ text: `${drafts} email(s) waiting for your OK`, href: "/outreach", tone: "signal" });
  const li = o.filter((x) => x.channel === "linkedin_task" && x.status === "task_open" && x.scheduled_for && x.scheduled_for <= new Date().toISOString()).length;
  if (li) todo.push({ text: `${li} LinkedIn step(s) to send`, href: "/outreach", tone: "signal" });
  const fu = r.filter((x) => x.follow_up_on && x.follow_up_on <= today && !["referred", "interview", "declined"].includes(x.stage)).length;
  if (fu) todo.push({ text: `${fu} referral follow-up(s) due`, href: "/referrals", tone: "signal" });
  const toPrep = highFit.filter((s) => s.reaction !== "skipped" && !a.some((x) => (x as unknown as { jobs?: { title: string } }).jobs?.title === s.jobs.title)).length;
  if (toPrep) todo.push({ text: `${toPrep} strong match(es) you haven't applied to`, href: "/autopilot", tone: "accent" });
  if (!(watch ?? []).length) todo.push({ text: "Pick a few great companies to watch", href: "/companies", tone: "accent" });

  return (
    <section className="py-6">
      <PageHeader eyebrow="Today" title="Your search at a glance">
        What needs you today, and how your search is moving. This week: {count("applied")} applied, {count("outreach_sent")} emails sent, {count("reply")} replies, {count("interview")} interviews.
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">To do</h2>
          {todo.length ? <ul className="flex flex-col gap-2">{todo.map((t) => (
            <li key={t.text}><Link href={t.href} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-accent">
              <span className="text-sm">{t.text}</span><Pill tone={t.tone}>Open</Pill></Link></li>
          ))}</ul> : <p className="text-sm text-muted">You&apos;re all caught up. New roles arrive every morning.</p>}
        </Card>
        <Card>
          <h2 className="mb-3 text-xl font-bold">Your funnel</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {funnel.map(([l, n, href]) => (
              <Link key={l} href={href} className="rounded-lg bg-sunk p-3 hover:outline hover:outline-1 hover:outline-accent">
                <b className="block font-display text-2xl num">{n}</b><span className="text-xs text-muted">{l}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <h2 className="mb-1 text-xl font-bold">This week vs last week</h2>
        <p className="mb-3 text-sm text-muted">
          Goal: {wf.goal.min} to {wf.goal.max} interviews a week. This week you have {wf.thisWeek.interviews}.
          {wf.replyRate !== null ? ` Replies per 100 emails sent: ${wf.replyRate}.` : " No emails sent yet, so no reply rate."}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([
            ["Applications", wf.thisWeek.applied, wf.lastWeek.applied],
            ["Emails sent", wf.thisWeek.sent, wf.lastWeek.sent],
            ["Replies", wf.thisWeek.replies, wf.lastWeek.replies],
            ["Referrals made", wf.thisWeek.referrals, wf.lastWeek.referrals],
            ["Interviews", wf.thisWeek.interviews, wf.lastWeek.interviews],
          ] as const).map(([label, now, before]) => (
            <div key={label} className="rounded-lg bg-sunk p-3">
              <b className="block font-display text-2xl num">{now}</b>
              <span className="text-xs text-muted">{label}</span>
              <span className="mt-0.5 block text-xs text-muted num">last week {before}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {tracks.map((t) => {
          const d = byTrack(t.id);
          return (
            <Card key={t.id}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold">{t.label}</h2>
                <span className="text-sm text-muted">{d.strong} strong match{d.strong === 1 ? "" : "es"} (75%+)</span>
              </div>
              <p className="mb-2 text-xs text-muted">{t.hint}</p>
              {d.fresh.length ? <ul className="flex flex-col divide-y divide-line">{d.fresh.map((s) => (
                <li key={s.jobs.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <a href={s.jobs.url} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:underline"><b>{s.jobs.title}</b> <span className="text-muted">· {s.jobs.companies?.name} · {s.jobs.location}</span></a>
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
