import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, btnPrimary } from "@/components/ui";
import { MIGRATION_0019 } from "@/lib/migration";
import { loadCopilots } from "@/lib/copilot-data";
import { matchesCopilot, MAX_COPILOTS, type JobLike } from "@/lib/copilots";
import CopilotCards, { type CopilotCard } from "./CopilotCards";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function CopilotsPage() {
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const uid = user?.id ?? "";
  const { copilots, needsMigration } = await loadCopilots(db, uid);

  let cards: CopilotCard[] = [];
  if (copilots.length > 0) {
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const { data } = await db.from("jobs").select("title, location, remote_type").eq("is_active", true).gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
    const recent = (data ?? []) as JobLike[];
    cards = copilots.map((c) => ({ ...c, newThisWeek: c.isOn ? recent.filter((j) => matchesCopilot(c, j)).length : 0 }));
  }

  return (
    <section className="py-6">
      <PageHeader eyebrow="Copilots" title="Your saved job searches">
        A Copilot is a search you set up once: the job titles, where, and what level. Backchannel shows the jobs it finds, ranked like the jobs you saved
        before and without the ones you skipped. Switch a Copilot off to pause its weekly count. Preparing and sending each application stays in To apply, where you approve it.
      </PageHeader>

      {needsMigration ? (
        <Card><p className="text-sm">{MIGRATION_0019}</p></Card>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{copilots.length} of {MAX_COPILOTS} Copilots</p>
            {copilots.length < MAX_COPILOTS && <Link href="/copilots/new" className={btnPrimary}>New Copilot</Link>}
          </div>
          {cards.length === 0 ? (
            <Empty>No Copilots yet. Create one to start a saved search, for example &quot;sales development&quot; remote in India.</Empty>
          ) : (
            <CopilotCards initial={cards} />
          )}
        </>
      )}
    </section>
  );
}
