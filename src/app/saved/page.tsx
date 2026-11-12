import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { formatCompanyName } from "@/lib/company-name";
import PasteJob from "../roles/PasteJob";
import SavedList, { type SavedJob } from "./SavedList";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; location: string | null; url: string | null; created_at: string | null; company_name: string | null; companies: { name: string } | null };

export default async function SavedJobsPage() {
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const uid = user?.id ?? "";
  const { data } = uid
    ? await db.from("jobs").select("id, title, location, url, created_at, company_name, companies(name)").eq("added_by", uid).eq("source", "pasted").order("created_at", { ascending: false }).limit(300)
    : { data: [] };
  const rows = (data ?? []) as unknown as Row[];
  const { data: scores } = rows.length ? await db.from("job_scores").select("job_id, score").eq("user_id", uid).in("job_id", rows.map((r) => r.id)) : { data: [] };
  const scoreBy = new Map((scores ?? []).map((s) => [s.job_id as string, s.score as number | null]));

  const jobs: SavedJob[] = rows.map((r) => ({
    id: r.id, title: r.title, company: formatCompanyName(r.companies?.name ?? r.company_name) || "Unknown", location: r.location ?? "",
    url: r.url ?? "", savedAt: r.created_at, score: scoreBy.get(r.id) ?? null,
  }));

  return (
    <section className="py-6">
      <PageHeader eyebrow="Saved jobs" title="Jobs you found yourself">
        Paste a link from any job board and save it. Everything you save by hand lives here, and it counts toward the coverage check on Today.
      </PageHeader>
      <PasteJob startOpen />
      <SavedList initial={jobs} />
    </section>
  );
}
