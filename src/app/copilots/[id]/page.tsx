import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { Empty, PageHeader, Pill, btn } from "@/components/ui";
import { formatCompanyName } from "@/lib/company-name";
import { loadCopilot, loadReactions, keptWordSet } from "@/lib/copilot-data";
import { describeWhere, expandTitle, keptScore, matchesCopilot, tokens } from "@/lib/copilots";
import MatchList, { type Match } from "./MatchList";

export const dynamic = "force-dynamic";

const SHOW = 100;

type JobRow = {
  id: string; title: string; location: string | null; remote_type: string | null; url: string | null; created_at: string | null;
  company_name: string | null; companies: { name: string } | null;
};

export default async function CopilotMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const uid = user?.id ?? "";
  const copilot = uid ? await loadCopilot(db, uid, id) : null;
  if (!copilot) notFound();

  // Narrow the database read to titles holding every word of a wanted title (or of its short form); the exact rules run below.
  const clauses = [...new Set(copilot.titles.flatMap((t) => expandTitle(t)))]
    .map((alt) => tokens(alt).map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length > 1))
    .filter((ws) => ws.length > 0)
    .map((ws) => (ws.length === 1 ? `title.ilike.%${ws[0]}%` : `and(${ws.map((w) => `title.ilike.%${w}%`).join(",")})`));
  let query = db.from("jobs").select("id, title, location, remote_type, url, created_at, company_name, companies(name)").eq("is_active", true);
  if (clauses.length > 0) query = query.or(clauses.join(","));
  const [{ data }, reactions] = await Promise.all([query.order("created_at", { ascending: false }).limit(1000), loadReactions(db, uid)]);

  const kept = keptWordSet(reactions);
  const rows = ((data ?? []) as unknown as JobRow[])
    .filter((j) => !reactions.skipped.has(j.id) && matchesCopilot(copilot, j))
    .map((j) => ({ j, boost: keptScore(j.title, kept) }))
    .sort((a, b) => b.boost - a.boost || (b.j.created_at ?? "").localeCompare(a.j.created_at ?? ""));

  const matches: Match[] = rows.slice(0, SHOW).map(({ j, boost }) => ({
    id: j.id,
    title: j.title,
    company: formatCompanyName(j.companies?.name ?? j.company_name) || "Unknown",
    location: j.location ?? "",
    url: j.url ?? "",
    saved: reactions.saved.has(j.id),
    likeKept: boost > 0,
  }));

  return (
    <section className="py-6">
      <PageHeader eyebrow="Copilot" title={copilot.name}>
        {copilot.titles.join(", ")} · {describeWhere(copilot)}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone={copilot.isOn ? "good" : "neutral"}>{copilot.isOn ? "On" : "Off"}</Pill>
        <Pill>{rows.length} match{rows.length === 1 ? "" : "es"}</Pill>
        {reactions.kept.size > 0 && <Pill tone="accent">Ranked like {reactions.kept.size} job{reactions.kept.size === 1 ? "" : "s"} you kept</Pill>}
        {reactions.skipped.size > 0 && <Pill>{reactions.skipped.size} skipped job{reactions.skipped.size === 1 ? "" : "s"} hidden</Pill>}
        <Link href={`/copilots/${copilot.id}/edit`} className={btn}>Edit</Link>
        <Link href="/copilots" className={btn}>All Copilots</Link>
      </div>
      {matches.length === 0 ? (
        <Empty>No jobs match yet. New jobs are collected daily; you can also widen the titles or places.</Empty>
      ) : (
        <MatchList initial={matches} />
      )}
      {rows.length > SHOW && <p className="mt-3 text-sm text-muted">Showing the top {SHOW} of {rows.length}.</p>}
    </section>
  );
}
