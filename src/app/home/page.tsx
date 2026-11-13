import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { loadSwipeFeed } from "@/lib/jobs/swipe-feed";
import { matchLabel } from "@/lib/match-label";
import { summarise } from "@/lib/application-status";
import { loadSetup } from "@/lib/onboarding-load";

export const dynamic = "force-dynamic";

const pill = "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm";

export default async function HomePage() {
  const db = await createClient();
  const user = await getSessionUser();
  const uid = user?.id ?? "";
  const [{ data: profile }, { data: apps }, jobs, setup] = await Promise.all([
    db.from("profiles").select("name, target_titles, markets").maybeSingle(),
    db.from("applications").select("status, stage, auto_status, auto_log").eq("user_id", uid).limit(500),
    uid ? loadSwipeFeed(db, uid) : Promise.resolve([]),
    loadSetup(db, uid),
  ]);
  // The auto-apply columns come with migration 0020; without them, count from status and stage only.
  const rows = (apps ?? []).map((a) => ({ status: a.status ?? null, stage: a.stage ?? null, auto_status: (a as { auto_status?: string | null }).auto_status ?? null, auto_log: null }));
  const summary = summarise(rows);
  const first = (profile?.name ?? user?.email ?? "").split(/[ @]/)[0];
  const titles = (profile?.target_titles as string[] | null) ?? [];
  const markets = (profile?.markets as string[] | null) ?? [];
  const goal = titles.length > 1 ? `${titles[0]} +${titles.length - 1}` : titles[0] ?? "All relevant roles";
  const top = jobs.slice(0, 6);

  return (
    <section className="py-5">
      <div className="mb-3 flex items-center justify-end">
        <Link href="/applications" className="inline-flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm text-bg">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{summary.sent}</span>
          applications sent
        </Link>
      </div>

      {setup.progress.next && (
        <Link href="/welcome" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent bg-accent-soft px-5 py-4">
          <span><b>{setup.progress.ready ? "Almost there" : "Finish setting up"}</b> <span className="text-muted">· {setup.progress.done} of {setup.progress.total} done. Next: {setup.progress.next.title.toLowerCase()}</span></span>
          <span className="text-sm font-semibold text-accent">Continue →</span>
        </Link>
      )}

      <div className="rounded-3xl bg-gradient-to-br from-[#5a4a3a] to-[#2b241d] px-6 py-14 text-center text-white md:py-20">
        <p className="eyebrow text-white/70">Welcome back{first ? `, ${first}` : ""}</p>
        <h1 className="mx-auto mt-4 max-w-2xl text-4xl leading-tight md:text-5xl">Your next role is already in here.</h1>
        <p className="mx-auto mt-4 max-w-xl text-white/80">Backchannel is ranking roles that fit your goal. Swipe through them, or let auto-apply work while you sleep.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/swipe" className="rounded-full bg-[#fdfbf7] px-6 py-3 font-semibold text-[#1d1a16]">Start swiping →</Link>
          <Link href="/autopilot" className="rounded-full border border-white/50 px-6 py-3 font-semibold text-white">Set up auto-apply</Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 text-muted">What jobs</span>
        <span className={pill}>{goal}</span>
        {markets.length > 0 && <span className={pill}>{markets.map((m) => m.replace("remote-in", "Remote India").replace(/^\w/, (c) => c.toUpperCase())).join(", ")}</span>}
        <Link href="/profile" className={pill}>Preferences ▾</Link>
      </div>

      <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">Jobs for you <span className="text-xl text-muted">({jobs.length})</span></h2>
        <div className="flex gap-2">
          <Link href="/roles" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold">Search</Link>
          <Link href="/swipe" className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">Swipe jobs</Link>
        </div>
      </div>

      {top.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">No new matches right now. New roles arrive every morning, or <Link href="/roles" className="font-semibold text-accent">search the full list</Link>.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {top.map((j) => (
            <li key={j.id} className="overflow-hidden rounded-3xl border border-line bg-surface">
              <div className="flex items-start justify-between gap-3 bg-sunk px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-lg font-semibold text-muted">{j.company.slice(0, 1).toUpperCase()}</span>
                  <p className="truncate font-semibold">{j.company}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl leading-none">{j.score}<span className="text-base text-muted">%</span></p>
                  <span className="mt-1 inline-block rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{matchLabel(j.score)}</span>
                </div>
              </div>
              <div className="px-5 py-4">
                <h3 className="text-2xl leading-snug"><Link href={`/roles/${j.id}`} className="hover:underline">{j.title}</Link></h3>
                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  {[j.location, j.workMode, j.pay ?? "Competitive salary", j.level].filter(Boolean).map((m) => <li key={m} className="rounded-full border border-line bg-bg px-3 py-1">{m}</li>)}
                </ul>
                <div className="mt-4"><Link href="/swipe" className="text-sm font-semibold text-accent">Review and apply →</Link></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
