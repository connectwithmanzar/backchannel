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
      <PageHeader eyebrow="Jobs" title="Swipe through your matches">
        The relevant roles you haven&apos;t looked at yet, best fit first. Swipe right or tap Apply and Backchannel prepares the application and sends it; you get four seconds to undo.
        Visa, salary and notice-period questions always stop and ask you.
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="View">
        <Link href="/swipe" aria-current={view === "swipe" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${view === "swipe" ? "bg-fg text-bg" : "border border-line bg-surface hover:border-fg/40"}`}>Swipe</Link>
        <Link href="/swipe?view=grid" aria-current={view === "grid" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${view === "grid" ? "bg-fg text-bg" : "border border-line bg-surface hover:border-fg/40"}`}>Grid</Link>
        <Link href="/roles" className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-fg/40">List with filters</Link>
      </div>
      <SwipeDeck initial={jobs} view={view} />
    </section>
  );
}
