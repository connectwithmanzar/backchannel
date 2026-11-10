import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { buildPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";
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
      <PageHeader eyebrow="Pipeline · all time" title="Where your search stands">
        Every role you saved, application you sent, person you contacted and answer you got, in one place. The weekly view is on Today.
      </PageHeader>
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
