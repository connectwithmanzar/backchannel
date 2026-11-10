"use client";
import { useState } from "react";
import { btn, btnPrimary, Card, input } from "@/components/ui";
import { parseAtsUrl, prettifySlug } from "@/lib/websearch";

interface Result { title: string; url: string; host: string; snippet: string }
type Kind = "jobs" | "companies";

const FIELDS: Record<Kind, { key: string; label: string; placeholder: string }[]> = {
  jobs: [
    { key: "role", label: "Role", placeholder: "e.g. SDR, account executive" },
    { key: "company", label: "Company", placeholder: "optional" },
    { key: "location", label: "Location", placeholder: "e.g. Dubai, Bengaluru, remote" },
    { key: "level", label: "Level", placeholder: "e.g. senior, manager" },
    { key: "tools", label: "Tools or skills", placeholder: "e.g. Salesforce, Outreach" },
  ],
  companies: [
    { key: "industry", label: "Industry", placeholder: "e.g. fintech, cybersecurity, HR tech" },
    { key: "location", label: "Location", placeholder: "e.g. UAE, India, Europe" },
    { key: "size", label: "Size", placeholder: "e.g. 50-200 employees" },
    { key: "stage", label: "Stage", placeholder: "e.g. Series B, profitable" },
  ],
};

export default function WebSearch({ kind }: { kind: Kind }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [days, setDays] = useState(30);
  const [workType, setWorkType] = useState("any");
  const [flag, setFlag] = useState(false); // visa (jobs) or hiring now (companies)
  const [wide, setWide] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function search() {
    setBusy("search"); setMsg(null); setResults(null);
    const res = await fetch("/api/web-search", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, ...vals, ...(kind === "jobs" ? { workType, visa: flag, days, wide } : { hiring: flag }) }),
    });
    const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
    setBusy("");
    if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Search failed." }); return; }
    setResults(data.results);
    if (!data.results.length) setMsg({ ok: true, text: "Nothing found. Try fewer or broader filters." });
  }

  async function watchCompany(r: Result) {
    const ats = parseAtsUrl(r.url);
    if (!ats) return;
    setBusy("w" + r.url); setMsg(null);
    const res = await fetch("/api/sources/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companies: [{ name: prettifySlug(ats.slug), domain: null }] }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    const o = data.outcomes?.[0];
    setMsg(!res.ok ? { ok: false, text: data.error ?? "Couldn't add that company." }
      : o?.status === "added" ? { ok: true, text: `Now watching ${prettifySlug(ats.slug)}: ${data.sales_roles} sales roles found.` }
      : o?.status === "already_there" ? { ok: true, text: `${prettifySlug(ats.slug)} is already watched.` }
      : { ok: false, text: `Couldn't read ${prettifySlug(ats.slug)}'s job board.` });
  }

  async function addJob(r: Result) {
    setBusy(r.url); setMsg(null);
    const res = await fetch("/api/jobs/paste", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: r.url, text: r.snippet.length >= 80 ? r.snippet : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    setMsg(res.ok ? { ok: true, text: `Added "${data.title}" at ${data.company} to My roles.` } : { ok: false, text: data.error ?? "Couldn't add that." });
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{kind === "jobs" ? "Search the open web for roles" : "Find companies on the open web"}</h2>
      <p className="text-sm text-muted">
        {kind === "jobs"
          ? "Searches real job postings on company career systems and job boards, beyond the companies Backchannel already watches. LinkedIn is never searched. Add a result to My roles to score it, or watch the whole company to get all their sales roles every morning."
          : "Discovers companies that match your criteria from across the web. Use the results to find people to ask, or add the company to the ones you watch."}
      </p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
        {FIELDS[kind].map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">{f.label}</span>
            <input className={input} placeholder={f.placeholder} value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
          </label>
        ))}
        {kind === "jobs" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Work type</span>
              <select className={input} value={workType} onChange={(e) => setWorkType(e.target.value)}>
                <option value="any">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Posted</span>
              <select className={input} value={days} onChange={(e) => setDays(+e.target.value)}>
                <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={0}>Any time</option>
              </select>
            </label>
          </>
        )}
        {kind === "jobs" && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} className="accent-accent" />
            Also search other sites (finds more, but includes blog posts and articles)
          </label>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} className="accent-accent" />
          {kind === "jobs" ? "Visa sponsorship offered" : "Hiring sales people now"}
        </label>
        <button type="submit" className={btnPrimary} disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Search the web"}</button>
      </form>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {results.map((r) => (
            <li key={r.url} className="flex flex-col gap-1.5 py-3">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">{r.title}</a>
              <span className="text-xs text-muted">{r.host}</span>
              {r.snippet && <p className="line-clamp-3 text-sm text-muted">{r.snippet}</p>}
              <div className="flex flex-wrap gap-2">
                {kind === "jobs"
                  ? <>
                      <button type="button" className={btn} disabled={!!busy} onClick={() => addJob(r)}>{busy === r.url ? "Adding…" : "Add to My roles"}</button>
                      {parseAtsUrl(r.url) && <button type="button" className={btn} disabled={!!busy} onClick={() => watchCompany(r)}>{busy === "w" + r.url ? "Adding…" : "Watch all their roles"}</button>}
                    </>
                  : <a className={btn} href={`/referrals?company=${encodeURIComponent(r.title.split(/[|\-–:]/)[0].trim())}&domain=${encodeURIComponent(r.host)}`}>Find people there</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
