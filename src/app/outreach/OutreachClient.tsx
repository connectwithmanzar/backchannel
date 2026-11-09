"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, Pill, btn, btnPrimary, input, label } from "@/components/ui";
import { postJson, copyText } from "@/lib/api";

export interface Step { id: string; contact_id: string; step_index: number; channel: "email" | "linkedin_task"; status: string; subject: string | null; body: string | null; scheduled_for: string | null; sent_at: string | null; error: string | null }
export interface ContactRow { id: string; name: string; title: string | null; email: string | null; linkedin_url: string | null; company_name: string | null; notes: string | null; steps: Step[] }
export interface JobOption { id: string; label: string; company: string }

const NOTICES: Record<string, [boolean, string]> = {
  connected: [true, "Gmail connected. Emails will send from your own address."],
  failed: [false, "Gmail connection didn't complete. Please try again."],
  cancelled: [false, "Gmail connection was cancelled."],
  not_configured: [false, "Gmail isn't set up yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing in Vercel."],
};
const STATUS: Record<string, [string, "neutral" | "good" | "warn" | "signal" | "accent"]> = {
  draft: ["Draft · needs your OK", "signal"], scheduled: ["Scheduled", "accent"], sent: ["Sent", "good"], replied: ["Replied", "good"],
  stopped: ["Stopped", "neutral"], failed: ["Failed", "warn"], task_open: ["To do", "signal"], task_done: ["Done", "good"], opened: ["Opened", "good"],
};
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default function OutreachClient({ contacts, jobs, gmailEmail, gmailReady, aiReady, notice, sentToday, settings }: {
  contacts: ContactRow[]; jobs: JobOption[]; gmailEmail: string | null; gmailReady: boolean; aiReady: boolean;
  notice: string | null; sentToday: number; settings: { limit: number; signature: string; todayLimit: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(notice && NOTICES[notice] ? { ok: NOTICES[notice][0], text: NOTICES[notice][1] } : null);
  const [form, setForm] = useState({ name: "", title: "", company_name: "", email: "", linkedin_url: "", job_id: "", notes: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(settings.limit);
  const [sig, setSig] = useState(settings.signature);

  async function act(key: string, url: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson(url, body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const now = Date.now();
  const tasks = contacts.flatMap((c) => c.steps.filter((s) => s.channel === "linkedin_task" && s.status === "task_open" && s.scheduled_for && new Date(s.scheduled_for).getTime() <= now).map((s) => ({ c, s })));
  const replies = contacts.filter((c) => c.steps.some((s) => s.status === "replied")).length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
      {!aiReady && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">AI isn&apos;t connected yet, so sequences can&apos;t be written. Add an AI key in Vercel.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <span className={label}>Gmail</span>
          {gmailEmail ? (
            <>
              <b className="break-all">{gmailEmail}</b>
              <span className="text-sm text-muted num">{sentToday} of {settings.todayLimit} emails sent in the last 24h{settings.todayLimit < settings.limit ? " (warming up: 5, 10, 15, then 20 a day)" : ""}</span>
              <button className={btn} disabled={!!busy} onClick={() => act("disc", "/api/gmail/disconnect", {}, "Gmail disconnected.")}>Disconnect</button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted">Connect your personal Gmail so emails send from your own address.</span>
              {gmailReady ? <a className={btnPrimary} href="/api/gmail/connect">Connect Gmail</a> : <span className="text-sm text-warn">Needs Google keys in Vercel first.</span>}
            </>
          )}
        </Card>
        <Card className="flex flex-col gap-1">
          <span className={label}>This week</span>
          <b className="font-display text-3xl num">{contacts.length}</b><span className="text-sm text-muted">people in sequences</span>
          <span className="text-sm num"><b>{replies}</b> replied</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className={label}>Sending rules</span>
          <label className="flex items-center gap-2 text-sm">Max emails a day
            <input id="o-limit" type="number" min={1} max={20} value={limit} onChange={(e) => setLimit(+e.target.value)} className={input + " w-20"} /></label>
          <textarea id="o-sig" rows={2} className={input} placeholder="Email signature (optional)" value={sig} onChange={(e) => setSig(e.target.value)} />
          <button className={btn} disabled={!!busy} onClick={() => act("set", "/api/outreach", { action: "settings", email_daily_limit: limit, email_signature: sig }, "Saved.")}>Save</button>
          <span className="text-xs text-muted">Always on: stop on reply, opt-out line, stealth blocklist.</span>
        </Card>
      </div>

      {tasks.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">LinkedIn tasks for today</h2>
          {tasks.map(({ c, s }) => (
            <div key={s.id} className="flex flex-col gap-2 rounded-lg bg-sunk p-3">
              <div><b>{s.subject}</b> · {c.name}, {c.company_name}</div>
              <p className="whitespace-pre-wrap text-sm">{s.body}</p>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={async () => setMsg((await copyText(s.body ?? "")) ? { ok: true, text: "Copied. Paste it on LinkedIn." } : { ok: false, text: "Select the text and copy it." })}>Copy message</button>
                {c.linkedin_url && <a className={btn} href={c.linkedin_url} target="_blank" rel="noopener noreferrer">Open profile ↗</a>}
                <button className={btn} disabled={!!busy} onClick={() => act(s.id, "/api/outreach", { action: "task_done", id: s.id }, "Marked done.")}>Mark done</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-xl font-bold">Add someone to reach out to</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          act("add", "/api/outreach", { action: "add_contact", ...form }, `Sequence written for ${form.name}. Review the first email below.`, () => setForm({ name: "", title: "", company_name: "", email: "", linkedin_url: "", job_id: "", notes: "" }));
        }}>
          {([["name", "Name *"], ["title", "Their title, e.g. Head of SDR"], ["company_name", "Company *"], ["email", "Work email"], ["linkedin_url", "LinkedIn profile link"]] as const).map(([k, p]) => (
            <input key={k} id={`f-${k}`} aria-label={p} placeholder={p} className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
          <select id="f-job" aria-label="Related role" className={input} value={form.job_id}
            onChange={(e) => { const j = jobs.find((x) => x.id === e.target.value); setForm({ ...form, job_id: e.target.value, company_name: form.company_name || j?.company || "" }); }}>
            <option value="">Related role (optional)</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
          <textarea id="f-notes" aria-label="Notes" rows={2} className={input + " sm:col-span-2"} placeholder="Anything personal to mention (e.g. you both spoke at an event). Only facts." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="sm:col-span-2"><button className={btnPrimary} disabled={!!busy || !aiReady}>{busy === "add" ? "Writing sequence… (about 20s)" : "Add and write sequence"}</button></div>
        </form>
      </Card>

      {contacts.length ? (
        <ul className="flex flex-col gap-3">
          {contacts.map((c) => {
            const first = c.steps.find((s) => s.step_index === 0);
            const state = c.steps.some((s) => s.status === "replied") ? ["Replied", "good"] : c.steps.every((s) => ["stopped", "task_done", "sent", "replied"].includes(s.status)) ? ["Finished", "neutral"] : first?.status === "draft" ? ["Waiting for your OK", "signal"] : ["In sequence", "accent"];
            return (
              <li key={c.id}><Card>
                <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                  <div className="min-w-0"><b>{c.name}</b> <span className="text-muted">· {c.title ? `${c.title}, ` : ""}{c.company_name}</span><div className="text-sm text-muted break-all">{c.email ?? "No email (LinkedIn only)"}</div></div>
                  <Pill tone={state[1] as "good"}>{state[0]}</Pill>
                </button>
                {open === c.id && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                    {c.steps.map((s) => <StepEditor key={s.id} s={s} busy={busy} gmail={!!gmailEmail} act={act} />)}
                    <div className="flex flex-wrap gap-2">
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "re", "/api/outreach", { action: "regenerate", contact_id: c.id }, "Rewritten.")}>{busy === c.id + "re" ? "Rewriting…" : "Rewrite unsent steps with AI"}</button>
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "rp", "/api/outreach", { action: "mark_replied", contact_id: c.id }, "Marked as replied. Sequence stopped.")}>They replied</button>
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "st", "/api/outreach", { action: "stop", contact_id: c.id }, "Sequence stopped.")}>Stop sequence</button>
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "del", "/api/outreach", { action: "delete_contact", contact_id: c.id }, "Contact deleted.")}>Delete</button>
                    </div>
                  </div>
                )}
              </Card></li>
            );
          })}
        </ul>
      ) : <Empty>No one yet. Add a hiring manager, sales leader or recruiter at a company you like.</Empty>}
    </div>
  );
}

function StepEditor({ s, busy, gmail, act }: { s: Step; busy: string | null; gmail: boolean; act: (k: string, u: string, b: object, ok: string) => Promise<void> }) {
  const [subject, setSubject] = useState(s.subject ?? "");
  const [body, setBody] = useState(s.body ?? "");
  const editable = ["draft", "scheduled", "failed", "task_open"].includes(s.status);
  const [txt, tone] = STATUS[s.status] ?? [s.status, "neutral"];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <b>{s.channel === "email" ? "Email" : "LinkedIn"} · step {s.step_index + 1}</b>
        <span className="flex items-center gap-2 text-muted num">{s.sent_at ? `Sent ${fmtDate(s.sent_at)}` : s.scheduled_for ? `Due ${fmtDate(s.scheduled_for)}` : ""}<Pill tone={tone}>{txt}</Pill></span>
      </div>
      {s.error && <p className="text-sm text-warn">{s.error}</p>}
      {s.channel === "email" && <input id={`s-${s.id}`} aria-label="Subject" className={input} value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} />}
      <textarea id={`b-${s.id}`} aria-label="Message" rows={s.channel === "email" ? 8 : 3} className={input} value={body} disabled={!editable} onChange={(e) => setBody(e.target.value)} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={!!busy} onClick={() => act(s.id + "e", "/api/outreach", { action: "edit_step", id: s.id, subject, body, channel: s.channel }, "Saved.")}>Save edits</button>
          {s.channel === "email" && (s.status === "draft" || s.status === "failed" || s.status === "scheduled") && (
            <button className={btnPrimary} disabled={!!busy || !gmail} title={gmail ? "" : "Connect Gmail first"}
              onClick={() => act(s.id + "s", "/api/outreach", { action: "send_now", id: s.id }, s.step_index === 0 ? "Sent. Follow-ups are due on their dates for you to approve, and stop if they reply." : "Sent.")}>
              {busy === s.id + "s" ? "Sending…" : s.step_index === 0 ? "Approve and send" : "Send now"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
