import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "@/components/ui";
import { BOARD_LABEL, BOARD_ORDER, GROUP_LABEL, GROUP_ORDER, MINUTES_PER_APPLICATION, boardColumn, detailOf, groupOf, summarise, timeSavedText, weeklySummary, type AppGroup } from "@/lib/application-status";
import { formatCompanyName } from "@/lib/company-name";
import { loadFeed } from "@/lib/apply-feed-load";
import LiveFeed from "./LiveFeed";
import { buildReceipt } from "@/lib/receipt";

export const dynamic = "force-dynamic";

type Row = {
  id: string; job_id: string; status: string | null; stage: string | null; auto_status: string | null; auto_log: string | null;
  auto_at: string | null; submitted_at: string | null; updated_at: string | null; created_at: string | null; tailored_cv: string | null;
  cover_note: string | null; receipt: string | null; questions: { q: string; answer: string; sensitive?: boolean }[] | null;
  jobs: { title: string; url: string | null; companies: { name: string } | null; company_name: string | null } | null;
};

const TONE: Record<AppGroup, "good" | "warn" | "signal" | "accent" | "neutral"> = {
  needs_you: "warn", in_progress: "accent", submitted: "neutral", interview: "good", offer: "signal", closed: "neutral",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ show?: string; view?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const user = await getSessionUser();
  const uid = user?.id ?? "";
  // The auto-apply columns come from migration 0020; read without them if it has not been run.
  const full = await db.from("applications")
    .select("id, job_id, status, stage, auto_status, auto_log, auto_at, submitted_at, updated_at, created_at, tailored_cv, cover_note, receipt, questions, jobs(title, url, company_name, companies(name))")
    .eq("user_id", uid).order("updated_at", { ascending: false }).limit(500);
  const plain = full.error
    ? await db.from("applications").select("id, job_id, status, stage, submitted_at, updated_at, created_at, tailored_cv, cover_note, receipt, questions, jobs(title, url, company_name, companies(name))")
        .eq("user_id", uid).order("updated_at", { ascending: false }).limit(500)
    : null;
  const rows = (((full.error ? plain?.data : full.data) ?? []) as unknown as Partial<Row>[]).map((r) => ({ auto_status: null, auto_log: null, auto_at: null, ...r })) as Row[];

  const feed = await loadFeed(db, uid);
  const summary = summarise(rows);
  const week = weeklySummary(rows);
  const board = sp.view === "board";
  const filter = GROUP_ORDER.includes(sp.show as AppGroup) ? (sp.show as AppGroup) : null;
  const shown = rows.filter((r) => !filter || groupOf(r) === filter);

  return (
    <section className="py-6">
      <PageHeader eyebrow="Applications" title="Every application, and where it stands">
        Sent from Swipe, the job page or the auto-apply robot. Anything that needs an answer from you is at the top.
      </PageHeader>

      <LiveFeed initial={feed} />

      <p className="mb-4 rounded-2xl border border-line bg-surface px-5 py-3 text-sm">
        <b>This week:</b> {week.sent} sent · {week.replies} {week.replies === 1 ? "reply" : "replies"} · {week.interviews} {week.interviews === 1 ? "interview" : "interviews"} · about {week.hoursSaved} hours saved
      </p>
      <div className="mb-4 inline-flex rounded-full border border-line bg-surface p-1" role="group" aria-label="View">
        <Link href="/applications" aria-current={!board ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-semibold ${!board ? "bg-bg shadow-sm" : "text-muted"}`}>List</Link>
        <Link href="/applications?view=board" aria-current={board ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-semibold ${board ? "bg-bg shadow-sm" : "text-muted"}`}>Board</Link>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-xs font-semibold uppercase tracking-wider text-muted">Sent</p><p className="mt-1 text-3xl font-bold">{summary.sent}</p></Card>
        <Card><p className="text-xs font-semibold uppercase tracking-wider text-muted">Needs you</p><p className="mt-1 text-3xl font-bold">{summary.counts.needs_you}</p></Card>
        <Card><p className="text-xs font-semibold uppercase tracking-wider text-muted">Time saved (estimate)</p><p className="mt-1 text-3xl font-bold">{timeSavedText(summary.minutesSaved)}</p><p className="mt-1 text-xs text-muted">Counted as {MINUTES_PER_APPLICATION} min per sent application.</p></Card>
      </div>

      {board ? (
        <div>
          <div className="grid gap-4 md:grid-cols-5">
            {BOARD_ORDER.map((col) => {
              const inCol = rows.filter((r) => boardColumn(r) === col);
              return (
                <section key={col} aria-label={BOARD_LABEL[col]} className="rounded-3xl bg-sunk p-3">
                  <h2 className="mb-3 flex items-center justify-between px-1 text-lg">{BOARD_LABEL[col]} <span className="text-sm text-muted">{inCol.length}</span></h2>
                  <ul className="flex flex-col gap-2">
                    {inCol.length === 0 && <li className="px-1 text-sm text-muted">Nothing here</li>}
                    {inCol.map((r) => {
                      const company = formatCompanyName(r.jobs?.companies?.name ?? r.jobs?.company_name ?? "") || "Unknown company";
                      return (
                        <li key={r.id} className="rounded-2xl border border-line bg-surface p-3">
                          <p className="text-xs text-muted">{company}</p>
                          <p className="font-semibold leading-snug"><Link href={`/roles/${r.job_id}`} className="hover:underline">{r.jobs?.title ?? "Role removed"}</Link></p>
                          <p className="mt-1 text-xs text-muted">{detailOf(r)}</p>
                          <p className="mt-1 text-xs text-muted">{r.submitted_at ? `Sent ${when(r.submitted_at)}` : `Started ${when(r.created_at)}`}</p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {rows.some((r) => boardColumn(r) === "closed") && (
            <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">Closed ({rows.filter((r) => boardColumn(r) === "closed").length})</summary>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
                {rows.filter((r) => boardColumn(r) === "closed").map((r) => <li key={r.id}>{r.jobs?.title ?? "Role removed"} · {formatCompanyName(r.jobs?.companies?.name ?? r.jobs?.company_name ?? "")} · {detailOf(r)}</li>)}
              </ul>
            </details>
          )}
        </div>
      ) : (
      <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <Link href="/applications" aria-current={!filter ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${!filter ? "bg-fg text-bg" : "border border-line bg-surface hover:border-fg/40"}`}>All {rows.length}</Link>
        {GROUP_ORDER.map((g) => (
          <Link key={g} href={`/applications?show=${g}`} aria-current={filter === g ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === g ? "bg-fg text-bg" : "border border-line bg-surface hover:border-fg/40"}`}>{GROUP_LABEL[g]} {summary.counts[g]}</Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card><p className="text-sm text-muted">{rows.length === 0 ? <>Nothing here yet. <Link href="/swipe" className="font-semibold text-accent">Swipe through your matches</Link> and tap Apply to start.</> : "No applications with this status."}</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...shown].sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b))).map((r) => {
            const g = groupOf(r);
            const company = formatCompanyName(r.jobs?.companies?.name ?? r.jobs?.company_name ?? "") || "Unknown company";
            const receipt = buildReceipt({ url: r.jobs?.url ?? null, status: r.status, auto_status: r.auto_status, submitted_at: r.submitted_at, receipt: r.receipt, tailored_cv: r.tailored_cv, cover_note: r.cover_note, questions: r.questions });
            const log = (r.auto_log ?? "").trim().split("\n").filter(Boolean).slice(-4);
            return (
              <li key={r.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-muted">{company}</p>
                      <h2 className="text-lg font-bold leading-snug"><Link href={`/roles/${r.job_id}`} className="hover:underline">{r.jobs?.title ?? "Role removed"}</Link></h2>
                    </div>
                    <Pill tone={TONE[g]}>{GROUP_LABEL[g]}</Pill>
                  </div>
                  <p className="text-sm">{detailOf(r)}</p>
                  <p className="text-xs text-muted">
                    {r.tailored_cv ? "Tailored CV used" : "Your standard CV"} · {r.submitted_at ? `Sent ${when(r.submitted_at)}` : `Started ${when(r.created_at)}`}
                    {r.updated_at ? ` · Updated ${when(r.updated_at)}` : ""}
                  </p>
                  {receipt && (
                    <details className="rounded-2xl bg-sunk p-3 text-sm">
                      <summary className="cursor-pointer font-semibold text-accent">Submission receipt · {receipt.filled} of {receipt.total} items filled</summary>
                      <p className="mt-2 text-muted">Sent through {receipt.provider}{receipt.sentAt ? ` on ${when(receipt.sentAt)}` : ""}{receipt.confirmation ? ` · Confirmation ${receipt.confirmation}` : ""}</p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {receipt.items.map((i, n) => (
                          <li key={n} className="flex gap-2">
                            <span className={i.filled ? "text-good" : "text-signal"} aria-hidden="true">{i.filled ? "✓" : "!"}</span>
                            <span className="min-w-0"><b>{i.label}</b>{i.fromSaved ? <span className="text-muted"> (from your saved answer)</span> : null}<br /><span className="text-muted">{i.detail}</span></span>
                          </li>
                        ))}
                      </ul>
                      {r.tailored_cv && <p className="mt-3"><a className="font-semibold text-accent" href={`/api/applications/${r.id}/pdf`} target="_blank" rel="noopener noreferrer">View the CV that was sent ↗</a></p>}
                    </details>
                  )}
                  {log.length > 0 && (
                    <details className="text-sm"><summary className="cursor-pointer font-semibold text-accent">Activity log</summary>
                      <ul className="mt-2 list-disc pl-5 text-muted">{log.map((l, i) => <li key={i}>{l.slice(0, 200)}</li>)}</ul>
                    </details>
                  )}
                  <div className="flex gap-4 text-sm font-semibold">
                    <Link href={`/roles/${r.job_id}`} className="text-accent">{g === "needs_you" ? "Open and finish" : "Open job"}</Link>
                    {r.jobs?.url && <a href={r.jobs.url} target="_blank" rel="noopener noreferrer" className="text-accent">Original posting ↗</a>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </section>
  );
}
