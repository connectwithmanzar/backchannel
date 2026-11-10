"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Pill, btn, btnPrimary, input } from "@/components/ui";
import { filterCompanies, filterCounts, needsAttention, type CompanyFilter, type CompanyRow, type CompanyStatus } from "@/lib/company-list";

const FILTERS: { id: CompanyFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "india", label: "Hiring in India" }, { id: "interested", label: "Interested" },
  { id: "applied", label: "Applied" }, { id: "attention", label: "Needs attention" },
];
const STATUS_LABEL: Record<Exclude<CompanyStatus, null>, string> = { interested: "Interested", applied: "Applied", not_for_me: "Not for me" };
const PAGE = 40;

function ago(iso: string | null) {
  if (!iso) return "not checked yet";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "checked today" : d === 1 ? "checked yesterday" : `checked ${d} days ago`;
}

export default function CompaniesList({ initial }: { initial: CompanyRow[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<CompanyFilter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => filterCompanies(rows, filter, query), [rows, filter, query]);
  const counts = useMemo(() => filterCounts(rows), [rows]);

  async function save(id: string, patch: { status?: CompanyStatus; note?: string }) {
    setMsg(null);
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, watching: patch.status ? true : r.watching } : r)));
    const res = await fetch("/api/company-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: id, ...patch }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setRows(before);
      setMsg({ ok: false, text: d.error ?? "Couldn't save that." });
    } else if (patch.note !== undefined) setMsg({ ok: true, text: "Note saved." });
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Your companies">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">Show</span>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => { setFilter(f.id); setLimit(PAGE); }} aria-pressed={filter === f.id}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === f.id ? "bg-accent text-accent-ink" : "bg-surface text-muted ring-1 ring-line hover:text-fg"}`}>
            {f.label} <span className="num opacity-70">· {counts[f.id]}</span>
          </button>
        ))}
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Search companies" aria-label="Search companies" className={`${input} ml-auto max-w-56`} />
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}

      {shown.length === 0 && <Card><p className="text-sm text-muted">{rows.length ? "No companies match this filter." : "No companies yet. Add some above and they are saved and scanned for jobs straight away."}</p></Card>}

      <ul className="flex flex-col gap-3">
        {shown.slice(0, limit).map((c) => {
          const open = notesOpen === c.id;
          const attention = needsAttention(c);
          return (
            <li key={c.id}>
              <Card className={attention ? "border-signal/50" : ""}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk font-bold text-muted" aria-hidden="true">{c.name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1 basis-56">
                    <h3 className="text-base font-semibold">{c.name}</h3>
                    <p className={`text-sm ${attention ? "text-signal" : "text-muted"}`}>
                      {c.hasBoard ? `${c.atsType} board · ${ago(c.lastCheckedAt)}${c.error ? ` · last check failed: ${c.error}` : ""}` : "No public job board. Scanned each morning through job-listing search and their careers page."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Your status for ${c.name}`}>
                    {(Object.keys(STATUS_LABEL) as Exclude<CompanyStatus, null>[]).map((s) => (
                      <button key={s} type="button" aria-pressed={c.status === s} onClick={() => save(c.id, { status: c.status === s ? null : s })}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${c.status === s ? "bg-accent text-accent-ink" : "bg-sunk text-muted hover:text-fg"}`}>{STATUS_LABEL[s]}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Pill tone={c.roles ? "good" : "neutral"}>{c.roles ? `${c.roles} sales role${c.roles === 1 ? "" : "s"}${c.inIndia ? ` · ${c.inIndia} in India` : ""}` : "No open sales roles"}</Pill>
                  {c.newThisWeek > 0 && <Pill tone="signal">Signal: {c.newThisWeek} new this week</Pill>}
                  {c.note && <Pill>Has a note</Pill>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/roles?q=${encodeURIComponent(c.name)}`} className={c.roles ? btnPrimary : btn}>View roles</Link>
                  <Link href={`/referrals?company=${encodeURIComponent(c.name)}&domain=${encodeURIComponent(c.domain ?? "")}`} className={btn}>Find people</Link>
                  <button type="button" className={btn} aria-expanded={open} onClick={() => { setNotesOpen(open ? null : c.id); setDraft((d) => ({ ...d, [c.id]: d[c.id] ?? c.note })); }}>{open ? "Close notes" : "Notes"}</button>
                  {!c.hasBoard && c.domain && <a className={btn} href={`https://${c.domain}/careers`} target="_blank" rel="noopener noreferrer">Careers page ↗</a>}
                </div>
                {open && (
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea rows={3} aria-label={`Notes on ${c.name}`} className={input} value={draft[c.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} placeholder="Private notes: who you know there, what to ask, what to avoid." />
                    <div><button type="button" className={btnPrimary} onClick={() => save(c.id, { note: draft[c.id] ?? "" })}>Save note</button></div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && <button type="button" className={btn} onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more ({shown.length - limit} left)</button>}
    </section>
  );
}
