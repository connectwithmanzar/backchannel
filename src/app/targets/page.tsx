import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import TargetsClient, { type TargetRow } from "./TargetsClient";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const db = await createClient();
  const user = await getSessionUser();
  const { data, error } = await db.from("targets").select("id, job_id, company, title, url, source, strategy, steps, notes, created_at").eq("user_id", user?.id ?? "").order("created_at", { ascending: false }).limit(200);
  const needsMigration = !!error;

  return (
    <section className="py-6">
      <PageHeader eyebrow="Jobs" title="Target list">
        The roles worth extra time. Keep each one here with a plan: find a referral, reach the hiring team by email and LinkedIn, then apply. Add roles from Swipe, a job page, or any link.
      </PageHeader>
      <TargetsClient initial={(data ?? []) as TargetRow[]} needsMigration={needsMigration} />
    </section>
  );
}
