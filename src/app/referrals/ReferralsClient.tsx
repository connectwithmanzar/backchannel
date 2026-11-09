"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, Pill, btn, btnPrimary, input } from "@/components/ui";
import { postJson, copyText } from "@/lib/api";

export interface Ref { id: string; company_name: string; role_title: string | null; job_id: string | null; referrer_name: string; referrer_relation: string | null; channel: string; message: string | null; stage: string; follow_up_on: string | null; notes: string | null }
export interface JobOpt { id: string; title: string; company: string }

const STAGES: [string, string][] = [["to_ask", "To ask"], ["asked", "Asked"], ["agreed", "Agreed"], ["referred", "Referred"], ["interview", "Interview"], ["declined", "Declined"]];

export default function ReferralsClient({ refs, jobs, aiReady }: { refs: Ref[]; jobs: JobOpt[]; aiReady: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const blank = { company_name: "", job_id: "", role_title: "", referrer_name: "", referrer_relation: "", channel: "linkedin", follow_up_on: "" };
  const [f, setF] = useState(blank);
  async function act(key: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson("/api/referrals", body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(null); }
  }
  const today = new Date().toISOString().slice(0, 10);
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, refs.filter((r) => r.stage === k).length]));

  return (
    <div className="flex flex-col gap-5">
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">{STAGES.map(([k, l]) => <Pill key={k} tone={k === "referred" || k === "interview" ? "good" : "neutral"}>{l} <span className="ml-1 num">{counts[k]}</span></Pill>)}</div>
      <Card>
        <h2 className="mb-3 text-xl font-bold">Add a referral to ask for</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act("add", { action: "add", ...f }, `Added. Click "Write the ask" to draft your message.`, () => setF(blank)); }}>
          <select id="r-job" aria-label="Role" className={input} value={f.job_id} onChange={(e) => { const j = jobs.find((x) => x.id === e.target.value); setF({ ...f, job_id: e.target.value, company_name: j?.company ?? f.company_name, role_title: j?.title ?? f.role_title }); }}>
            <option value="">Pick a role (optional)</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.company} · {j.title}</option>)}
          </select>
          <input id="r-company" aria-label="Company" placeholder="Company *" className={input} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
          <input id="r-name" aria-label="Person" placeholder="Person you know there *" className={input} value={f.referrer_name} onChange={(e) => setF({ ...f, referrer_name: e.target.value })} />
          <input id="r-rel" aria-label="How you know them" placeholder="How you know them, e.g. ex-colleague at Acme" className={input} value={f.referrer_relation} onChange={(e) => setF({ ...f, referrer_relation: e.target.value })} />
          <select id="r-channel" aria-label="Channel" className={input} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            <option value="linkedin">LinkedIn</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="other">Other</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">Follow up on <input id="r-fu" type="date" className={input + " w-auto"} value={f.follow_up_on} onChange={(e) => setF({ ...f, follow_up_on: e.target.value })} /></label>
          <div className="sm:col-span-2"><button className={btnPrimary} disabled={!!busy}>Add</button></div>
        </form>
      </Card>
      {refs.length ? (
        <ul className="flex flex-col gap-3">{refs.map((r) => <RefItem key={r.id + ":" + (r.message ?? "").length} r={r} busy={busy} act={act} aiReady={aiReady} overdue={!!r.follow_up_on && r.follow_up_on <= today && !["referred", "interview", "declined"].includes(r.stage)} setMsg={setMsg} />)}</ul>
      ) : <Empty>No referrals yet. Think of one person at a company on your list and add them.</Empty>}
    </div>
  );
}

function RefItem({ r, busy, act, aiReady, overdue, setMsg }: { r: Ref; busy: string | null; aiReady: boolean; overdue: boolean; act: (k: string, b: object, ok: string) => Promise<void>; setMsg: (m: { ok: boolean; text: string }) => void }) {
  const [m, setM] = useState(r.message ?? "");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function emailThem() {
    if (r.referrer_name.includes("*")) { setMsg({ ok: false, text: "This name is only partly shown. Reveal the full name in Find who to ask, or edit it, before emailing." }); return; }
    setSending(true);
    try {
      await postJson("/api/outreach", { action: "add_contact", name: r.referrer_name, company_name: r.company_name, email: email.trim(), title: r.referrer_relation ?? undefined, job_id: r.job_id ?? undefined });
      setMsg({ ok: true, text: "Email sequence drafted. Review and approve it on the Outreach page." });
      setEmail(""); router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setSending(false); }
  }
  return (
    <li><Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><b>{r.referrer_name}</b> <span className="text-muted">at {r.company_name}</span><div className="text-sm text-muted">{r.role_title ?? "Any sales role"}{r.referrer_relation ? ` · ${r.referrer_relation}` : ""} · via {r.channel}</div></div>
        <div className="flex items-center gap-2">
          {overdue && <Pill tone="warn">Follow up today</Pill>}
          <select aria-label="Stage" className={input + " w-auto"} value={r.stage} disabled={!!busy} onChange={(e) => act(r.id + "st", { action: "update", id: r.id, stage: e.target.value }, "Updated.")}>
            {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <textarea id={`m-${r.id}`} aria-label="Message" rows={5} className={input} placeholder="Your message. Click 'Write the ask' to draft it with AI." value={m} onChange={(e) => setM(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={!!busy || !aiReady} onClick={async () => { await act(r.id + "d", { action: "draft", id: r.id }, "Drafted. Edit it, copy it, and send it yourself."); }}>{busy === r.id + "d" ? "Writing…" : "Write the ask"}</button>
        <button className={btn} disabled={!!busy} onClick={() => act(r.id + "s", { action: "update", id: r.id, message: m }, "Saved.")}>Save</button>
        <button className={btn} onClick={async () => setMsg((await copyText(m)) ? { ok: true, text: "Copied." } : { ok: false, text: "Select the text and copy it." })}>Copy</button>
        {r.stage === "to_ask" && <button className={btnPrimary} disabled={!!busy} onClick={() => act(r.id + "a", { action: "update", id: r.id, stage: "asked", message: m, follow_up_on: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10) }, "Marked as asked. Follow-up reminder set for 4 days.")}>I sent it</button>}
        <button className={btn} disabled={!!busy} onClick={() => act(r.id + "x", { action: "delete", id: r.id }, "Deleted.")}>Delete</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input aria-label="Their work email" type="email" className={input + " max-w-xs"} placeholder="Their email (you find it yourself)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className={btn} disabled={sending || !email.includes("@")} onClick={emailThem}>{sending ? "Drafting…" : "Email this person"}</button>
        <span className="text-xs text-muted">Creates a draft on Outreach. Nothing sends until you approve it.</span>
      </div>
    </Card></li>
  );
}
