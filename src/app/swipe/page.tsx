import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { loadSwipeFeed } from "@/lib/jobs/swipe-feed";
import SwipeDeck from "./SwipeDeck";
import TargetButton from "@/components/TargetButton";
import { matchLabel } from "@/lib/match-label";

export const dynamic = "force-dynamic";

export default async function SwipePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "grid" ? "grid" : "swipe";
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const jobs = user ? await loadSwipeFeed(db, user.id) : [];

  const priority = jobs.filter((j) => j.tier).slice(0, 3);

  return (
    <section className="py-6">
      <PageHeader eyebrow="Jobs" title="Jobs">
        The relevant roles you haven&apos;t looked at yet, best fit first. Swipe right or tap Apply and Backchannel prepares the application and sends it; you get four seconds to undo.
        Visa, salary and notice-period questions always stop and ask you.
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-3" role="group" aria-label="View">
        <div className="inline-flex rounded-full border border-line bg-surface p-1">
          <Link href="/swipe" aria-current={view === "swipe" ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-semibold ${view === "swipe" ? "bg-bg shadow-sm" : "text-muted"}`}>Swipe</Link>
          <Link href="/swipe?view=grid" aria-current={view === "grid" ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-semibold ${view === "grid" ? "bg-bg shadow-sm" : "text-muted"}`}>Grid</Link>
        </div>
        <Link href="/roles" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold">Filters and list</Link>
      </div>
      {priority.length > 0 && (
        <section aria-label="Priority roles" className="mb-8">
          <h2 className="text-2xl">Priority: your top companies</h2>
          <p className="mt-1 text-sm text-muted">Roles at companies you rated highly. Ask a person first, then apply.</p>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {priority.map((j) => (
              <li key={j.id} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">{j.company} · Tier {j.tier}</p>
                    <h3 className="text-xl leading-snug"><Link href={`/roles/${j.id}`} className="hover:underline">{j.title}</Link></h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-signal-soft px-3 py-1 text-sm font-medium text-signal">{j.score}%</span>
                </div>
                <p className="text-xs text-muted">{matchLabel(j.score)} · {j.location}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Link href={`/referrals?company=${encodeURIComponent(j.company)}&role=${encodeURIComponent(j.title)}`} className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">Ask for referral</Link>
                  <TargetButton jobId={j.id} source="swipe" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SwipeDeck initial={jobs} view={view} />
    </section>
  );
}
