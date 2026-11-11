"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Empty, Pill, btn, btnPrimary, input, label } from "@/components/ui";
import { postJson, copyText } from "@/lib/api";
import { SENSITIVE_LABELS } from "@/lib/apps/labels";

type Q = { q: string; answer: string; sensitive: boolean; key?: string };
export interface AppRow {
  id: string; job_id: string; status: string; stage: string | null; tailored_cv: string | null; cover_note: string | null;
  cv_changes: string[] | null; questions: Q[] | null; receipt: string | null; submitted_at: string | null; notes: string | null;
  jobs: { title: string; url: string; location: string; companies: { name: string } | null } | null;
}
export interface Suggestion { job_id: string; score: number; bookmarked: boolean; explanation: string; title: string; url: string; location: string; company: string }

const STAGES = [["applied", "Applied"], ["screening", "Screening"], ["interview", "Interview"], ["final", "Final round"], ["offer", "Offer"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"]];

export default function AutopilotClient({ apps, suggestions, settings, savedAnswers, hasCv, aiReady }: {
  apps: AppRow[]; suggestions: Suggestion[]; settings: { mode: "ask" | "auto"; minFit: number; cap: number };
  savedAnswers: Record<string, string>; hasCv: boolean; aiReady: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"todo" | "review" | "applied" | "settings">(apps.some((a) => a.status === "needs_answer" || a.status === "awaiting_approval") ? "review" : "todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const review = apps.filter((a) => a.status === "needs_answer" || a.status === "awaiting_approval");
  const applied = apps.filter((a) => a.status === "submitted");

  async function act(key: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson("/api/applications", body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const tabs = [
    ["todo", `Ready to prepare (${suggestions.length})`], ["review", `Review & submit (${review.length})`],
    ["applied", `Applied (${applied.length})`], ["settings", "Settings & saved answers"],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {!hasCv && <p className="rounded-lg bg-signal-soft px-3 py-2 text-sm text-signal">Upload your CV on <Link className="underline" href="/profile">your profile</Link> first. Autopilot only uses facts from your CV.</p>}
      {!aiReady && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">AI isn&apos;t connected yet, so applications can&apos;t be prepared. Add an AI key in Vercel (see the setup guide).</p>}
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? "border-accent text-fg" : "border-transparent text-muted"}`}>{l}</button>
        ))}
      </div>

      {tab === "todo" && (suggestions.length ? (
        <ul className="flex flex-col gap-2.5">
          {suggestions.map((s) => (
            <li key={s.job_id}><Card className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold">{s.title}</div>
                <div className="text-sm text-muted">{s.company} · {s.location}</div>
                <div className="mt-1 flex flex-wrap gap-1.5"><Pill tone="accent">Fit {s.score}%</Pill>{s.bookmarked && <Pill tone="signal">Saved by you</Pill>}</div>
              </div>
              <div className="flex gap-2">
                <a className={btn} href={s.url} target="_blank" rel="noopener noreferrer">View role ↗</a>
                <button className={btnPrimary} disabled={!!busy || !hasCv || !aiReady}
                  onClick={() => act(s.job_id, { action: "prepare", job_id: s.job_id }, `Prepared your application for ${s.company}. It's in Review & submit.`, () => setTab("review"))}>
                  {busy === s.job_id ? "Preparing… (about 30s)" : "Prepare application"}
                </button>
              </div>
            </Card></li>
          ))}
        </ul>
      ) : <Empty>No matches above {settings.minFit}% fit yet. Save roles with the bookmark on the Roles page, or lower the minimum fit in Settings.</Empty>)}

      {tab === "review" && (review.length ? (
        <ul className="flex flex-col gap-3">
          {review.map((a) => <ReviewItem key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} busy={busy} act={act} />)}
        </ul>
      ) : <Empty>Nothing to review. Prepare an application from Ready to prepare.</Empty>)}

      {tab === "applied" && (applied.length ? (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="px-3 py-2">Role</th><th className="px-3 py-2">Applied</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Receipt</th></tr></thead>
            <tbody>{applied.map((a) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className="px-3 py-2"><b>{a.jobs?.title}</b><div className="text-muted">{a.jobs?.companies?.name}</div></td>
                <td className="px-3 py-2 num whitespace-nowrap">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-IN") : "—"}</td>
                <td className="px-3 py-2">
                  <select aria-label="Stage" className={input + " w-auto"} value={a.stage ?? "applied"} disabled={!!busy}
                    onChange={(e) => act(a.id, { action: "stage", id: a.id, stage: e.target.value }, "Stage updated.")}>
                    {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-muted">{a.receipt || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>Applications you submit show up here, so you can track each one through to an offer.</Empty>)}

      {tab === "settings" && <Settings settings={settings} saved={savedAnswers} busy={busy} act={act} />}
    </div>
  );
}

function ReviewItem({ a, open, onToggle, busy, act }: {
  a: AppRow; open: boolean; onToggle: () => void; busy: string | null;
  act: (k: string, b: object, ok: string, after?: () => void) => Promise<void>;
}) {
  const [qs, setQs] = useState<Q[]>(a.questions ?? []);
  const [cv, setCv] = useState(a.tailored_cv ?? "");
  const [note, setNote] = useState(a.cover_note ?? "");
  const [saveDefaults, setSaveDefaults] = useState(true);
  const [receipt, setReceipt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const needs = a.status === "needs_answer";
  const copy = async (k: string, t: string) => { if (await copyText(t)) { setCopied(k); setTimeout(() => setCopied(null), 1500); } };

  return (
    <li><Card>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="min-w-0"><div className="font-bold">{a.jobs?.title}</div><div className="text-sm text-muted">{a.jobs?.companies?.name} · {a.jobs?.location}</div></div>
        {needs ? <Pill tone="warn">Confirm your answers</Pill> : <Pill tone="good">Ready to submit</Pill>}
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-5 border-t border-line pt-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-bold">Form answers</h3>
            {qs.map((q, i) => (
              <label key={i} className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{q.q} {q.sensitive && <Pill tone="signal">You answer this</Pill>}</span>
                <textarea id={`q-${a.id}-${i}`} rows={q.sensitive ? 1 : 3} className={input} value={q.answer}
                  onChange={(e) => setQs(qs.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))} />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveDefaults} onChange={(e) => setSaveDefaults(e.target.checked)} className="accent-accent" /> Remember my visa, salary and notice-period answers for next time</label>
            <div><button className={btn} disabled={!!busy} onClick={() => act(a.id + "ans", { action: "answer", id: a.id, answers: Object.fromEntries(qs.map((q, i) => [i, q.answer])), save_defaults: saveDefaults }, "Answers saved.")}>{busy === a.id + "ans" ? "Saving…" : "Save answers"}</button></div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">Cover note</h3><button className={btn} onClick={() => copy("note", note)}>{copied === "note" ? "Copied" : "Copy"}</button></div>
            <textarea id={`note-${a.id}`} rows={6} className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">Tailored CV</h3><button className={btn} onClick={() => copy("cv", cv)}>{copied === "cv" ? "Copied" : "Copy"}</button></div>
            {(a.cv_changes ?? []).length > 0 && <ul className="list-disc pl-5 text-sm text-muted">{(a.cv_changes ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>}
            <textarea id={`cv-${a.id}`} rows={14} className={input + " font-mono text-[13px]"} value={cv} onChange={(e) => setCv(e.target.value)} />
            <div><button className={btn} disabled={!!busy} onClick={() => act(a.id + "edit", { action: "edit", id: a.id, tailored_cv: cv, cover_note: note }, "Edits saved.")}>{busy === a.id + "edit" ? "Saving…" : "Save edits"}</button></div>
          </section>

          <section className="flex flex-col gap-2 rounded-lg bg-sunk p-3">
            <h3 className="text-lg font-bold">Submit</h3>
            <p className="text-sm text-muted">Open the company&apos;s application page, paste your answers and CV, and submit there. Then confirm here so it&apos;s tracked.</p>
            <div className="flex flex-wrap gap-2">
              <a className={btnPrimary} href={a.jobs?.url} target="_blank" rel="noopener noreferrer">Open application page ↗</a>
              <input id={`rcpt-${a.id}`} className={input + " max-w-xs"} placeholder="Confirmation number or note (optional)" value={receipt} onChange={(e) => setReceipt(e.target.value)} />
              <button className={btn} disabled={!!busy || needs} title={needs ? "Answer the highlighted questions first" : ""}
                onClick={() => act(a.id + "sub", { action: "submitted", id: a.id, receipt }, "Marked as submitted. Good luck!")}>{busy === a.id + "sub" ? "Saving…" : "I submitted it"}</button>
              <button className={btn} disabled={!!busy} onClick={() => act(a.id + "skip", { action: "skip", id: a.id }, "Skipped.")}>Skip this role</button>
            </div>
          </section>
        </div>
      )}
    </Card></li>
  );
}

function Settings({ settings, saved, busy, act }: {
  settings: { mode: "ask" | "auto"; minFit: number; cap: number }; saved: Record<string, string>; busy: string | null;
  act: (k: string, b: object, ok: string) => Promise<void>;
}) {
  const [mode, setMode] = useState(settings.mode);
  const [minFit, setMinFit] = useState(settings.minFit);
  const [cap, setCap] = useState(settings.cap);
  const [answers, setAnswers] = useState<Record<string, string>>(saved);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-bold">Mode</h3>
        {([["ask", "Prepare when I click", "You choose which roles to prepare."], ["auto", "Prepare automatically every morning", "After the daily job check, Autopilot prepares your best new matches, up to your daily limit. You still review and submit each one."]] as const).map(([v, t, d]) => (
          <label key={v} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3">
            <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1 accent-accent" />
            <span><b>{t}</b><span className="block text-sm text-muted">{d}</span></span>
          </label>
        ))}
        <label className="flex flex-col gap-1"><span className={label}>Minimum fit: <span className="num">{minFit}%</span></span><input type="range" min={50} max={95} step={5} value={minFit} onChange={(e) => setMinFit(+e.target.value)} className="accent-accent" /></label>
        <label className="flex flex-col gap-1"><span className={label}>Daily limit: <span className="num">{cap}</span> applications</span><input type="range" min={1} max={15} value={cap} onChange={(e) => setCap(+e.target.value)} className="accent-accent" /></label>
        <button className={btnPrimary} disabled={!!busy} onClick={() => act("settings", { action: "settings", autopilot_mode: mode, autopilot_min_fit: minFit, autopilot_daily_cap: cap }, "Settings saved.")}>Save settings</button>
      </Card>
      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">Saved answers</h3>
        <p className="text-sm text-muted">Autopilot never guesses these. It fills them from here, or asks you.</p>
        {Object.entries(SENSITIVE_LABELS).map(([k, l]) => (
          <label key={k} className="flex flex-col gap-1"><span className="text-sm font-semibold">{l}</span>
            <input id={`sa-${k}`} className={input} value={answers[k] ?? ""} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
          </label>
        ))}
        <button className={btn} disabled={!!busy} onClick={() => act("answers", { action: "settings", standard_answers: answers }, "Saved answers updated.")}>Save answers</button>
      </Card>
    </div>
  );
}
