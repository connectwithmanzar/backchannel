"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, Card, input } from "@/components/ui";

type Role = { title: string; location: string; url: string };
type Result = { title: string; url: string; host: string; snippet: string };
type Outcome =
  | { status: "board"; how: string; name: string; roles: Role[] }
  | { status: "results"; name: string; domain: string | null; workday: string | null; results: Result[] }
  | { status: "none"; name: string; domain: string | null; workday: string | null; careersUrl: string | null };

export default function CompanyJobsFinder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const [out, setOut] = useState<Outcome | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function find() {
    setBusy(true); setMsg(null); setOut(null);
    const res = await fetch("/api/company-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, website }) });
    const d = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error ?? "Search failed." }); return; }
    setOut(d);
    if (d.status === "board") router.refresh();
  }

  async function add(r: Result) {
    setAdding(r.url); setMsg(null);
    const res = await fetch("/api/jobs/paste", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: r.url, text: r.snippet.length >= 80 ? r.snippet : undefined }) });
    const d = await res.json().catch(() => ({}));
    setAdding("");
    setMsg(res.ok ? { ok: true, text: `Added "${d.title}" at ${d.company} to My roles.` } : { ok: false, text: d.error ?? "Couldn't add that." });
    if (res.ok) router.refresh();
  }

  return (
    <Card className="mb-5 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Find jobs at a company</h2>
      <p className="text-sm text-muted">Type any company. Backchannel looks for its job board, reads its careers page, and searches the job sites, so you don&apos;t need to know which system it uses.</p>
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); void find(); }}>
        <input aria-label="Company" className={input} placeholder="Company, e.g. Freshworks" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Website (optional)" className={input} placeholder="Website (optional), e.g. freshworks.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <button type="submit" className={btnPrimary} disabled={busy || name.trim().length < 2}>{busy ? "Looking… (up to a minute)" : "Find their jobs"}</button>
      </form>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
      {out?.status === "board" && (
        <div className="text-sm">
          <p className="font-semibold text-good">{out.name}: {out.roles.length ? `${out.roles.length} sales role${out.roles.length === 1 ? "" : "s"} found (${out.how}). They are now in My roles and refresh every morning.` : `board found (${out.how}) but no open sales roles right now. It is watched, so new ones will appear.`}</p>
          <ul className="mt-2 flex flex-col gap-1">{out.roles.map((r) => <li key={r.url + r.title}><a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">{r.title}</a> <span className="text-muted">· {r.location}</span></li>)}</ul>
        </div>
      )}
      {out?.status === "results" && (
        <div className="text-sm">
          <p className="font-semibold">No job board to watch automatically, but these pages mention {out.name}:</p>
          {out.workday && <p className="mt-1 text-muted">They use Workday, but no open sales roles were found there right now. <a href={out.workday} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">Open their Workday jobs</a>.</p>}
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {out.results.map((r) => (
              <li key={r.url} className="flex flex-col gap-1 py-2">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">{r.title}</a>
                <span className="text-xs text-muted">{r.host}</span>
                <div><button type="button" className={btn} disabled={!!adding} onClick={() => add(r)}>{adding === r.url ? "Adding…" : "Add to My roles"}</button></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {out?.status === "none" && (
        <p className="text-sm text-muted">
          I couldn&apos;t find open sales roles for {out.name} automatically.
          {out.workday ? <> They use Workday, but no open sales roles were found there right now: <a href={out.workday} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">open their jobs</a>.</> : out.careersUrl ? <> Try <a href={out.careersUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">their careers page</a> and paste any role you like with &quot;Add a job you found&quot;.</> : " Add their website above and try again."}
        </p>
      )}
    </Card>
  );
}
