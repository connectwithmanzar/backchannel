"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, Card, input, Pill } from "@/components/ui";

interface Person { id: string; firstName: string; lastHint: string; title: string; company: string; hasEmail: boolean; role: "hiring_manager" | "recruiter" | "other"; location?: string }
interface Revealed { name: string; title: string; linkedinUrl: string | null; location?: string }

const ROLE_LABEL: Record<Person["role"], string> = { hiring_manager: "Hiring side", recruiter: "Recruiter", other: "Other" };

export default function FindPeople({ configured, initialCompany = "", initialDomain = "" }: { configured: boolean; initialCompany?: string; initialDomain?: string }) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const [domain, setDomain] = useState(initialDomain);
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState("both");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(action: string, body: Record<string, unknown>) {
    const res = await fetch("/api/contacts/find", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
    return { ok: res.ok, data };
  }

  async function search(refresh = false) {
    setBusy("search"); setMsg(null); setPeople(null);
    const { ok, data } = await call("search", { company, domain, location, kind, refresh });
    setBusy("");
    if (!ok) { setMsg({ ok: false, text: data.error ?? "Search failed." }); return; }
    setPeople(data.people);
    setFromCache(!!data.cached);
    if (!data.people.length) setMsg({ ok: true, text: "No matching people found for that company. Try another, or add someone you know below." });
  }

  async function reveal(p: Person) {
    setBusy(p.id); setMsg(null);
    const { ok, data } = await call("reveal", { person_id: p.id });
    setBusy("");
    if (!ok) { setMsg({ ok: false, text: data.error ?? "Reveal failed." }); return; }
    setRevealed((r) => ({ ...r, [p.id]: data.person }));
  }

  async function addReferral(p: Person) {
    setBusy("add" + p.id); setMsg(null);
    const r = revealed[p.id];
    const res = await fetch("/api/referrals", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", company_name: p.company, referrer_name: r?.name ?? `${p.firstName} ${p.lastHint}`.trim(), referrer_relation: p.title, channel: "linkedin" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Couldn't add." }); return; }
    setMsg({ ok: true, text: `Added ${p.firstName} to your referrals below.` });
    router.refresh();
  }

  return (
    <Card className="mb-5 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Find who to ask</h2>
      {!configured ? (
        <p className="text-sm text-muted">People search isn&apos;t set up yet. It needs an Apollo API key (<code>APOLLO_API_KEY</code>) in Vercel. Until then, add people you know in the form below.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Enter a target company. Website and domain are auto-detected via AI search if omitted. Filter by region (e.g. Dubai, Bengaluru) to request referrals from people in your geography.</p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
            <input aria-label="Company" className={input} placeholder="Company, e.g. Apollo.io, Holistic AI" value={company} onChange={(e) => setCompany(e.target.value)} />
            <input aria-label="Website" className={input} placeholder="Website (optional, auto-detected)" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <input aria-label="Location" className={input} placeholder="Location, e.g. Dubai, Bengaluru (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
            <select aria-label="Who to look for" className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="both">Sales leaders, then recruiters</option>
              <option value="hiring">Sales leaders only</option>
              <option value="recruiter">Recruiters only</option>
            </select>
            <button type="submit" className={btnPrimary} disabled={busy === "search" || !company.trim()}>{busy === "search" ? "Searching…" : "Find people"}</button>
          </form>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
          {people && people.length > 0 && fromCache && (
            <p className="text-xs text-muted">Saved result from an earlier search. <button type="button" className="font-semibold text-accent hover:underline" disabled={!!busy} onClick={() => search(true)}>Search again</button></p>
          )}
          {people && people.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {people.map((p) => {
                const r = revealed[p.id];
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <b>{r?.name ?? `${p.firstName} ${p.lastHint}`}</b> <span className="text-muted">· {p.title}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Pill tone={p.role === "other" ? "neutral" : "accent"}>{ROLE_LABEL[p.role]}</Pill>
                        {(r?.location || p.location) && (
                          <Pill tone="good">📍 {r?.location || p.location}</Pill>
                        )}
                        {p.hasEmail && <span>email on file</span>}
                        {r?.linkedinUrl && <a href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">LinkedIn profile</a>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!r && <button type="button" className={btn} disabled={!!busy} onClick={() => reveal(p)} title="May use Apollo credits">{busy === p.id ? "Revealing…" : "Reveal name and LinkedIn"}</button>}
                      <button type="button" className={btn} disabled={!!busy} onClick={() => addReferral(p)}>{busy === "add" + p.id ? "Adding…" : "Add to referrals"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
