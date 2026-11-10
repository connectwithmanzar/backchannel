"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, Pill, btn, btnPrimary, input, label } from "@/components/ui";
import { postJson, copyText } from "@/lib/api";
import { buildQueue, todoCount, type QueueItem } from "@/lib/outreach/queue";

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
const OPT_OUT_LINE = /\n*[^\n]*(unsubscribe|opt[- ]?out|not interested)[^\n]*$/i;
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
  const [replyView, setReplyView] = useState<Record<string, { loading: boolean; error?: string; messages?: { from: string; date: string; text: string }[] }>>({});
  const [checking, setChecking] = useState(false);

  async function checkNow(quiet = false) {
    setChecking(true);
    try {
      const r = (await postJson("/api/outreach", { action: "check_replies" })) as { replies?: number; bounces?: number };
      const n = (r.replies ?? 0) + (r.bounces ?? 0);
      if (n > 0) { setMsg({ ok: true, text: `${r.replies ? `${r.replies} new repl${r.replies === 1 ? "y" : "ies"}` : ""}${r.replies && r.bounces ? " and " : ""}${r.bounces ? `${r.bounces} bounced address${r.bounces === 1 ? "" : "es"}` : ""} found. Those sequences stopped.` }); router.refresh(); }
      else if (!quiet) setMsg({ ok: true, text: "No new replies." });
    } catch (e) { if (!quiet) setMsg({ ok: false, text: (e as Error).message }); }
    finally { setChecking(false); }
  }
  // Reply check does not depend on any scheduler: it also runs whenever you open this page.
  useEffect(() => { if (gmailEmail) void checkNow(true); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReply(contactId: string) {
    setReplyView((v) => ({ ...v, [contactId]: { loading: true } }));
    try {
      const r = (await postJson("/api/outreach", { action: "view_reply", contact_id: contactId })) as { messages?: { from: string; date: string; text: string }[] };
      setReplyView((v) => ({ ...v, [contactId]: { loading: false, messages: r.messages ?? [] } }));
    } catch (e) { setReplyView((v) => ({ ...v, [contactId]: { loading: false, error: (e as Error).message } })); }
  }

  async function act(key: string, url: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson(url, body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const now = Date.now();
  const queue = buildQueue(contacts, now);
  const replies = queue.replied.length;
  const [reviewing, setReviewing] = useState<string | null>(null);
  const copyAndNote = async (text: string) => setMsg((await copyText(text)) ? { ok: true, text: "Copied. Paste it on LinkedIn." } : { ok: false, text: "Select the text and copy it." });

  function renderCard(item: QueueItem<ContactRow>, kind: "needsOk" | "followUp" | "linkedin") {
    const { contact: c, step: s } = item;
    const label = kind === "needsOk" ? "First email · needs your OK" : kind === "followUp" ? `Follow-up · step ${s.step_index + 1}` : s.subject ?? "LinkedIn message";
    return (
      <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0"><b>{c.name}</b> <span className="text-muted">· {c.title ? `${c.title}, ` : ""}{c.company_name}</span></div>
          <Pill tone={kind === "linkedin" ? "accent" : "signal"}>{label}</Pill>
        </div>
        <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted">{(s.body ?? "").replace(OPT_OUT_LINE, "").trim()}</p>
        <div className="flex flex-wrap gap-2">
          {kind === "linkedin" ? (
            <>
              <button className={btnPrimary} onClick={async () => { await copyAndNote(s.body ?? ""); if (c.linkedin_url) window.open(c.linkedin_url, "_blank", "noopener,noreferrer"); }} disabled={!c.linkedin_url}>Open profile and copy message</button>
              {!c.linkedin_url && <button className={btn} onClick={() => copyAndNote(s.body ?? "")}>Copy message</button>}
              <button className={btn} disabled={!!busy} onClick={() => act(s.id, "/api/outreach", { action: "task_done", id: s.id }, "Marked sent.")}>I sent it</button>
            </>
          ) : (
            <>
              <button className={btnPrimary} onClick={() => setReviewing(reviewing === s.id ? null : s.id)}>{reviewing === s.id ? "Hide" : "Review and send"}</button>
              {c.linkedin_url && <a className={btn} href={c.linkedin_url} target="_blank" rel="noopener noreferrer">Open profile ↗</a>}
            </>
          )}
          <button className={btn} disabled={!!busy} onClick={() => act(c.id + "rp", "/api/outreach", { action: "mark_replied", contact_id: c.id }, "Marked as replied. Sequence stopped.")}>They replied</button>
        </div>
        {kind !== "linkedin" && reviewing === s.id && <StepEditor s={s} busy={busy} gmail={!!gmailEmail} act={act} />}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
      {!aiReady && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">AI isn&apos;t connected yet, so sequences can&apos;t be written. Add an AI key in Vercel.</p>}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className={label}>Today</span>
            <h2 className="text-2xl font-bold">{todoCount(queue) ? `${todoCount(queue)} to do` : "Nothing due right now"}</h2>
          </div>
          {gmailEmail && <span className="text-sm text-muted num">{sentToday} of {settings.todayLimit} emails sent in the last 24h</span>}
        </div>
        {todoCount(queue) === 0 && <p className="text-sm text-muted">{contacts.length ? "You're caught up. New follow-ups appear here on their day, and replies stop a sequence." : "Add a hiring manager, sales leader or recruiter below to start."}</p>}
        {queue.needsOk.length > 0 && <div><h3 className="mb-2 font-semibold">Needs your OK ({queue.needsOk.length})</h3><ul className="flex flex-col gap-2">{queue.needsOk.map((i) => renderCard(i, "needsOk"))}</ul></div>}
        {queue.followUps.length > 0 && <div><h3 className="mb-2 font-semibold">Follow-ups due ({queue.followUps.length})</h3><ul className="flex flex-col gap-2">{queue.followUps.map((i) => renderCard(i, "followUp"))}</ul></div>}
        {queue.linkedin.length > 0 && <div><h3 className="mb-2 font-semibold">LinkedIn to send by hand ({queue.linkedin.length})</h3><ul className="flex flex-col gap-2">{queue.linkedin.map((i) => renderCard(i, "linkedin"))}</ul></div>}
        {queue.replied.length > 0 && <div><h3 className="mb-2 font-semibold">Replied ({queue.replied.length})</h3><ul className="flex flex-col gap-1 text-sm">{queue.replied.map((c) => <li key={c.id}><button type="button" className="font-semibold text-accent hover:underline" onClick={() => { setOpen(c.id); document.getElementById(`p-${c.id}`)?.scrollIntoView({ behavior: "smooth" }); }}>{c.name}, {c.company_name}</button> <span className="text-muted">· read the reply</span></li>)}</ul></div>}
        {queue.waiting.length > 0 && <p className="text-sm text-muted">Waiting on {queue.waiting.length} {queue.waiting.length === 1 ? "person" : "people"} to reply: {queue.waiting.slice(0, 6).map((c) => c.name).join(", ")}{queue.waiting.length > 6 ? "…" : ""}</p>}
      </Card>
      <details open={!gmailEmail}>
        <summary className="cursor-pointer rounded-card border border-line bg-surface px-4 py-3 text-lg font-bold">Gmail, sending rules and weekly numbers</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
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

      </details>
      {gmailEmail && contacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button className={btn} disabled={checking} onClick={() => checkNow(false)}>{checking ? "Checking your inbox…" : "Check replies now"}</button>
          <span className="text-xs text-muted">Replies are also checked when you open this page and every hour.</span>
        </div>
      )}
      {contacts.length ? (
        <ul className="flex flex-col gap-3">
          {contacts.map((c) => {
            const first = c.steps.find((s) => s.step_index === 0);
            const state = c.steps.some((s) => s.status === "replied") ? ["Replied", "good"] : c.steps.every((s) => ["stopped", "task_done", "sent", "replied"].includes(s.status)) ? ["Finished", "neutral"] : first?.status === "draft" ? ["Waiting for your OK", "signal"] : ["In sequence", "accent"];
            return (
              <li key={c.id} id={`p-${c.id}`}><Card>
                <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                  <div className="min-w-0"><b>{c.name}</b> <span className="text-muted">· {c.title ? `${c.title}, ` : ""}{c.company_name}</span><div className="text-sm text-muted break-all">{c.email ?? "No email (LinkedIn only)"}</div></div>
                  <Pill tone={state[1] as "good"}>{state[0]}</Pill>
                </button>
                {open === c.id && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                    {c.steps.map((s) => <StepEditor key={s.id} s={s} busy={busy} gmail={!!gmailEmail} act={act} />)}
                    {c.steps.some((s) => s.status === "replied" || s.status === "sent") && gmailEmail && (
                      <div className="rounded-lg border border-line bg-sunk p-3">
                        <button className={btn} disabled={replyView[c.id]?.loading} onClick={() => loadReply(c.id)}>{replyView[c.id]?.loading ? "Loading…" : replyView[c.id]?.messages ? "Refresh replies" : "View replies"}</button>
                        {replyView[c.id]?.error && <p className="mt-2 text-sm text-warn">{replyView[c.id]?.error}</p>}
                        {replyView[c.id]?.messages?.length === 0 && <p className="mt-2 text-sm text-muted">No reply in the thread yet.</p>}
                        {replyView[c.id]?.messages?.map((m, i) => (
                          <div key={i} className="mt-2 rounded-lg bg-surface p-3">
                            <div className="text-xs text-muted">{m.from}{m.date ? ` · ${m.date}` : ""}</div>
                            <p className="mt-1 whitespace-pre-line text-sm">{m.text || "(no text in this message)"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "re", "/api/outreach", { action: "regenerate", contact_id: c.id }, "Rewritten.")}>{busy === c.id + "re" ? "Rewriting…" : "Rewrite unsent steps with AI"}</button>
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "rp", "/api/outreach", { action: "mark_replied", contact_id: c.id }, "Marked as replied. Sequence stopped.")}>They replied</button>
                      <button className={btn} disabled={!!busy} onClick={() => act(c.id + "st", "/api/outreach", { action: "stop", contact_id: c.id }, "Sequence stopped.")}>Stop sequence</button>
                      <button className={btn} disabled={!!busy} onClick={() => { if (!window.confirm(`Delete ${c.name} and all their drafts? This can't be undone.`)) return; void act(c.id + "del", "/api/outreach", { action: "delete_contact", contact_id: c.id }, "Contact deleted."); }}>Delete</button>
                    </div>
                  </div>
                )}
              </Card></li>
            );
          })}
        </ul>
      ) : <Empty>No one yet. Add a hiring manager, sales leader or recruiter at a company you like.</Empty>}
      <details open={contacts.length === 0}>
        <summary className="cursor-pointer rounded-card border border-line bg-surface px-4 py-3 text-lg font-bold">Add someone to reach out to</summary>
        <div className="mt-3">
      <Card>
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
        </div>
      </details>
    </div>
  );
}

export function StepEditor({ s, busy, gmail, act }: { s: Step; busy: string | null; gmail: boolean; act: (k: string, u: string, b: object, ok: string) => Promise<void> }) {
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
              onClick={() => { if (!window.confirm("Send this email now? It can't be unsent.")) return; void act(s.id + "s", "/api/outreach", { action: "send_now", id: s.id }, s.step_index === 0 ? "Sent. Follow-ups are due on their dates for you to approve, and stop if they reply." : "Sent."); }}>
              {busy === s.id + "s" ? "Sending…" : s.step_index === 0 ? "Approve and send" : "Send now"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
