import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { Card, Pill, btn, btnPrimary } from "@/components/ui";
import { weeklyFunnel } from "@/lib/funnel";
import FitRing from "@/components/FitRing";
import { greeting, firstName } from "@/lib/format";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

const MIN_SENDS_FOR_RATE = 10;

export default async function TodayPage() {
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const uid = user?.id ?? "";
  const twoWeeksAgo = new Date(Date.now() - 14 * 864e5).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: scores }, { data: apps }, { data: steps }, { data: refs }, { data: events }, { data: profile }, { data: watch }, { data: gmail }] = await Promise.all([
    db.from("job_scores").select("score, reaction, explanation, scored_at, jobs!inner(id, title, url, location, market, is_active, created_at, company_name, companies(name))").eq("user_id", uid).eq("jobs.is_active", true).order("score", { ascending: false }).limit(300),
    db.from("applications").select("id, status, stage, jobs(title)").eq("user_id", uid),
    db.from("outreach").select("id, status, channel, scheduled_for, step_index").eq("user_id", uid),
    db.from("referrals").select("id, stage, follow_up_on").eq("user_id", uid),
    db.from("funnel_events").select("type, occurred_at").eq("user_id", uid).gte("occurred_at", twoWeeksAgo),
    db.from("profiles").select("cv_text, name, markets").eq("user_id", uid).maybeSingle(),
    db.from("watchlist").select("company_id").eq("user_id", uid).eq("watching", true),
    serviceClient().from("gmail_accounts").select("user_id").eq("user_id", uid).maybeSingle(),
  ]);

  type S = { score: number | null; reaction: string | null; explanation: string | null; jobs: { id: string; title: string; url: string; location: string; market: string | null; company_name: string | null; created_at: string; companies: { name: string } | null } };
  const sc = (scores ?? []) as unknown as S[];
  const highFit = sc.filter((s) => (s.score ?? 0) >= 75 && s.reaction !== "skipped");
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
  const emailDue = o.filter((x) => x.channel === "email" && x.status === "draft" && x.scheduled_for && x.scheduled_for <= nowIso);
  const drafts = emailDue.filter((x) => x.step_index === 0).length;
  const followUpEmails = emailDue.filter((x) => x.step_index > 0).length;
  if (drafts) todo.push({ text: `Approve ${plural(drafts, "email")} waiting for you`, cta: "Approve", href: "/outreach", tone: "signal" });
  const li = o.filter((x) => x.channel === "linkedin_task" && x.status === "task_open" && x.scheduled_for && x.scheduled_for <= nowIso).length;
  if (li) todo.push({ text: `Send ${plural(li, "LinkedIn message")} yourself`, cta: "Open", href: "/outreach", tone: "signal" });
  const referralFollowUps = r.filter((x) => x.follow_up_on && x.follow_up_on <= today && !["referred", "interview", "declined"].includes(x.stage)).length;
  const fu = referralFollowUps + followUpEmails;
  if (referralFollowUps) todo.push({ text: `Follow up on ${plural(referralFollowUps, "referral ask", "referral asks")}`, cta: "Follow up", href: "/referrals", tone: "signal" });
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

  const matches = [...highFit].filter((x) => !appliedTitles.has(x.jobs.title)).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 5);
  const steps3 = [
    { tag: "Step 1 · Review", count: toReview, text: toReview === 1 ? "strong match to review" : "strong matches to review", sub: "Each shows why it fits.", cta: "Review matches", href: "/roles", tone: "accent" as const },
    { tag: "Step 2 · Reach out", count: drafts + li, text: drafts + li === 1 ? "message needs you" : "messages need you", sub: "Nothing sends without your OK.", cta: "Open queue", href: "/outreach", tone: "accent" as const },
    { tag: "Step 3 · Follow up", count: fu, text: fu === 1 ? "person to chase" : "people to chase", sub: "Reminders only; you decide.", cta: "See follow-ups", href: followUpEmails ? "/outreach" : "/referrals", tone: "signal" as const },
  ];
  const doneToday = (events ?? []).filter((e) => ["applied", "outreach_sent", "referral"].includes(e.type) && new Date(e.occurred_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })).length;
  const planTotal = toReview + drafts + li + fu + doneToday;
  const dateText = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">{greeting()}, {firstName(profile?.name, user?.email)}</h1>
        <p className="mt-1 text-muted">{dateText} · {toReview ? plural(toReview, "strong match", "strong matches") : "no new strong matches"}, {plural(drafts + li, "message")} waiting, {plural(fu, "follow-up")} due.</p>
      </header>

      {setupLeft.length > 0 && (
        <Card className="mb-5 border-accent">
          <h2 className="text-xl font-bold">Get set up ({setup.length - setupLeft.length} of {setup.length} done)</h2>
          <p className="mt-1 text-sm text-muted">Four quick steps, about 10 minutes. Scores and drafts get better with each one.</p>
          <ol className="mt-3 flex flex-col gap-2">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className={`flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-accent ${s.done ? "opacity-60" : ""}`}>
                  <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-good text-accent-ink" : "border border-line text-muted"}`}>{s.done ? "✓" : ""}</span>
                  <span className="text-sm"><b>{s.label}</b> <span className="text-muted">{s.why}</span></span>
                  <span className="sr-only">{s.done ? "Done" : "Not done yet"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Today&apos;s plan</h2>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="num">{doneToday} of {planTotal} done</span>
            <span className="h-2 w-40 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="block h-full bg-accent" style={{ width: `${planTotal ? Math.round((doneToday / planTotal) * 100) : 0}%` }} /></span>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps3.map((st) => (
            <div key={st.tag} className="flex flex-col items-start gap-2 rounded-xl bg-bg p-4">
              <Pill tone={st.tone}>{st.tag}</Pill>
              <b className="text-base"><span className="num">{st.count}</span> {st.text}</b>
              <span className="text-sm text-muted">{st.sub}</span>
              <Link href={st.href} className={st.count ? btnPrimary : btn}>{st.cta}</Link>
            </div>
          ))}
        </div>
        {todo.some((t) => t.tone === "warn") && (
          <ul className="mt-4 flex flex-col gap-2">{todo.filter((t) => t.tone === "warn").map((t) => (
            <li key={t.text}><Link href={t.href} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-accent"><span className="text-sm">{t.text}</span><Pill tone="warn">{t.cta} →</Pill></Link></li>
          ))}</ul>
        )}
      </Card>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_620px] flex-col gap-4" aria-label="Best matches">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Best matches for you today</h2>
            <span className="text-sm text-muted">Ranked by fit</span>
          </div>
          {matches.length ? matches.map((m) => (
            <Card key={m.jobs.id} className="flex flex-wrap gap-4 sm:p-5">
              <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
                <h3 className="text-[17px] font-semibold">{m.jobs.title}</h3>
                <div className="text-sm text-muted">{m.jobs.companies?.name ?? m.jobs.company_name} · {m.jobs.location || "Location not stated"}</div>
                {m.explanation && <p className="line-clamp-2 text-sm">{m.explanation}</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  <Link href={`/roles/${m.jobs.id}`} className={btnPrimary}>See why it fits</Link>
                  {m.jobs.url && <a href={m.jobs.url} target="_blank" rel="noopener noreferrer" className={btn}>Open role ↗</a>}
                </div>
              </div>
              <FitRing score={m.score ?? 0} />
            </Card>
          )) : (
            <Card><p className="text-sm text-muted">No new strong matches yet. Add companies on <Link href="/companies" className="font-semibold text-accent">Companies</Link> or run a search on <Link href="/roles" className="font-semibold text-accent">Matches</Link>, and new roles arrive every morning.</p></Card>
          )}
          <Link href="/roles" className={`${btn} self-start`}>See all matches</Link>
        </section>

        <aside className="flex min-w-[280px] flex-[1_1_300px] flex-col gap-4" aria-label="Side panels">
          <Card>
            <h2 className="mb-1 text-[17px] font-semibold">Your week</h2>
            <p className="mb-3 text-sm text-muted">{rateText}</p>
            <div className="grid grid-cols-2 gap-3">
              {week.filter(([label]) => label !== "Referrals made").map(([label, now, before]) => {
                const delta = now - before;
                return (
                  <div key={label} className="rounded-xl bg-bg p-3">
                    <b className={`block font-display text-2xl num ${now ? "" : "text-muted"}`}>{now}</b>
                    <span className="text-xs text-muted">{label}</span>
                    <span className={`mt-0.5 block text-xs num ${delta > 0 ? "text-good" : "text-muted"}`}>{delta > 0 ? `+${delta} vs last week` : delta < 0 ? `${delta} vs last week` : "same as last week"}</span>
                  </div>
                );
              })}
            </div>
            <Link href="/pipeline" className="mt-3 inline-block text-sm font-semibold text-accent">See the full funnel →</Link>
          </Card>
          <Card>
            <h2 className="mb-1 text-[17px] font-semibold">Where roles come from</h2>
            <p className="text-sm text-muted">{plural((watch ?? []).length, "watched company", "watched companies")} and {plural(sc.length, "scored role")}. This is not every job: add companies, search the open web, or save any role you find.</p>
            <Link href="/companies" className={`${btn} mt-3`}>Add companies</Link>
          </Card>
        </aside>
      </div>
    </section>
  );
}
