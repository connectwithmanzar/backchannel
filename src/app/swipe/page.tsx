import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { loadSwipeFeed } from "@/lib/jobs/swipe-feed";
import SwipeDeck from "./SwipeDeck";

export const dynamic = "force-dynamic";

export default async function SwipePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "grid" ? "grid" : "swipe";
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const jobs = user ? await loadSwipeFeed(db, user.id) : [];

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
      <SwipeDeck initial={jobs} view={view} />
    </section>
  );
}
