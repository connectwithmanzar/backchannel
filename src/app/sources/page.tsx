import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import SourcesClient, { type SourceRow } from "./SourcesClient";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: companies }, { data: runs }] = await Promise.all([
    supabase.from("companies").select("id, name, domain, ats_type, ats_slug, enabled, open_sales_roles, collect_error, last_collected_at").order("name"),
    supabase.from("collect_runs").select("created_at, summary").order("created_at", { ascending: false }).limit(1),
  ]);
  const last = runs?.[0];
  return (
    <section className="py-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">Job sources</div>
      <h1 className="mt-1 text-3xl font-extrabold">Where your roles come from</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Backchannel checks these companies&apos; public careers boards every morning. Add any company by name and it finds their board for you. Broken boards are repaired automatically.
      </p>
      {last && (
        <p className="mt-3 text-sm text-muted num">
          Last run {new Date(last.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST ·{" "}
          {last.summary?.sales_roles ?? 0} sales roles from {last.summary?.companies_checked ?? 0} companies ·{" "}
          {last.summary?.failed ?? 0} failed · {last.summary?.repaired ?? 0} repaired
        </p>
      )}
      <SourcesClient rows={(companies ?? []) as SourceRow[]} owner={isOwner(user?.email)} />
    </section>
  );
}
