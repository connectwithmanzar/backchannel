import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { buildPipeline } from "@/lib/pipeline";
import type { BoardContact, Outcome } from "@/lib/board";
import BoardView from "./BoardView";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";
  // The outcome column arrives with migration 0013; until it is run, read people without it.
  const withOutcome = await db.from("contacts").select("id, name, title, company_name, outcome").eq("user_id", uid);
  const plainContacts = withOutcome.error ? await db.from("contacts").select("id, name, title, company_name").eq("user_id", uid) : null;
  const contactRows = ((withOutcome.error ? plainContacts?.data : withOutcome.data) ?? []) as { id: string; name: string; title: string | null; company_name: string | null; outcome?: Outcome }[];
  const { data: stepRows } = await db.from("outreach").select("id, contact_id, step_index, channel, status, scheduled_for").eq("user_id", uid).order("step_index");
  const board: BoardContact[] = contactRows.map((c) => ({
    id: c.id, name: c.name, title: c.title, company_name: c.company_name, outcome: c.outcome ?? null,
    steps: (stepRows ?? []).filter((x) => x.contact_id === c.id) as BoardContact["steps"],
  }));
  const [{ count: saved }, { data: apps }, { data: steps }, { data: refs }] = await Promise.all([
    db.from("job_scores").select("job_id", { count: "exact", head: true }).eq("user_id", uid).in("reaction", ["bookmarked", "applied"]),
    db.from("applications").select("stage, status, jobs(board)").eq("user_id", uid),
    db.from("outreach").select("contact_id, channel, status").eq("user_id", uid),
    db.from("referrals").select("stage").eq("user_id", uid).eq("stage", "interview"),
  ]);
  const p = buildPipeline({
    saved: saved ?? 0,
    apps: (apps ?? []).map((a) => ({ stage: a.stage, status: a.status, board: (a.jobs as unknown as { board: string | null } | null)?.board ?? null })),
    steps: steps ?? [],
    referralInterviews: refs?.length ?? 0,
  });
  const top = Math.max(1, ...p.stages.map((s) => s.count));

  return (
    <section className="py-6">
      <PageHeader eyebrow="Pipeline" title="Where everyone stands">
        Today&apos;s follow-ups first, then everyone you have contacted by stage. Your all-time numbers are below.
      </PageHeader>
      <div className="mb-10"><BoardView contacts={board} outcomeReady={!withOutcome.error} /></div>
      <h2 className="mb-4 text-xl font-semibold">Your numbers, all time</h2>
      {p.hints.length > 0 && (
        <Card className="mb-5 flex flex-col gap-2 border-signal">
          <h2 className="text-lg font-bold">What to fix first</h2>
          <ul className="list-disc pl-5 text-sm">{p.hints.map((h) => <li key={h}>{h}</li>)}</ul>
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">The funnel</h2>
        <ul className="flex flex-col gap-2">
          {p.stages.map((s) => (
            <li key={s.key} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
              <span>{s.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(s.count ? 4 : 0, Math.round((s.count / top) * 100))}%` }} />
              </span>
              <b className="num text-right">{s.count}</b>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted num">
          Reply rate: {p.replyRate === null ? "after your first email" : `${p.replyRate}% of people emailed`} · Interview rate: {p.interviewRate === null ? "after your first application" : `${p.interviewRate}% of applications`}
        </p>
      </Card>
      {p.bySource.length > 0 && (
        <Card className="mt-5 flex flex-col gap-3">
          <h2 className="text-xl font-bold">Which sources lead to interviews</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Applied</th><th className="py-1">Interviews</th></tr></thead>
              <tbody>{p.bySource.map((s) => <tr key={s.source} className="border-t border-line"><td className="py-1.5 pr-3">{s.source}</td><td className="num py-1.5 pr-3">{s.applied}</td><td className="num py-1.5">{s.interviews}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Counts are your own results, so read them as a trend once you have a few dozen applications, not before.</p>
        </Card>
      )}
    </section>
  );
}
