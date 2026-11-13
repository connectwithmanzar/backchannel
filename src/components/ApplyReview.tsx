"use client";
import { useState } from "react";
import { Pill, btn, btnPrimary, input } from "@/components/ui";
import { copyText } from "@/lib/api";
import type { AutoMode } from "@/lib/auto-apply";

export type Q = { q: string; answer: string; sensitive: boolean; key?: string };

export interface AppRow {
  id: string; job_id: string; status: string; stage: string | null; tailored_cv: string | null; cover_note: string | null;
  cv_changes: string[] | null; questions: Q[] | null; receipt: string | null; submitted_at: string | null; notes: string | null;
  auto_status?: string | null; auto_log?: string | null;
  jobs: { title: string; url: string; location: string; companies: { name: string } | null } | null;
}

export type Act = (key: string, body: object, ok: string, after?: () => void) => Promise<void>;

/** Form answers, cover note, tailored CV and the submit step for one prepared application. Used on the job page and in Applications. */
export default function ApplyReview({ a, busy, act, autoMode = "off" }: { a: AppRow; busy: string | null; act: Act; autoMode?: AutoMode }) {
  const [qs, setQs] = useState<Q[]>(a.questions ?? []);
  const [cv, setCv] = useState(a.tailored_cv ?? "");
  const [note, setNote] = useState(a.cover_note ?? "");
  const [saveDefaults, setSaveDefaults] = useState(true);
  const [receipt, setReceipt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState<number | null>(null);
  const needs = a.status === "needs_answer";
  const copy = async (k: string, t: string) => { if (await copyText(t)) { setCopied(k); setTimeout(() => setCopied(null), 1500); } };

  async function regenerate(index: number) {
    setRegenBusy(index);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "regenerate_answer", id: a.id, index }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.answer) {
        setQs(qs.map((q, idx) => (idx === index ? { ...q, answer: data.answer } : q)));
      }
    } catch {
      // ignore
    } finally {
      setRegenBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Form answers</h3>
          <span className="text-xs text-muted">✨ Grounded in Story Bank &amp; metrics (Zero AI fluff)</span>
        </div>
        {qs.map((q, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-fg">
                {q.q}
              </span>
              <div className="flex items-center gap-2">
                {q.sensitive ? (
                  <Pill tone="signal">🔒 Sensitive (Standing Answer)</Pill>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>✨ Story Bank Grounded</span>
                  </span>
                )}
                {!q.sensitive && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-accent hover:underline disabled:opacity-50"
                    disabled={regenBusy === i || !!busy}
                    onClick={() => regenerate(i)}
                  >
                    {regenBusy === i ? "Generating…" : "⚡ Regenerate in my voice"}
                  </button>
                )}
              </div>
            </div>
            <textarea
              id={`q-${a.id}-${i}`}
              rows={q.sensitive ? 1 : 3}
              className={`${input} mt-1`}
              value={q.answer}
              placeholder={q.sensitive ? "Enter your standing answer..." : "Human answer grounded in candidate metrics..."}
              onChange={(e) => setQs(qs.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveDefaults} onChange={(e) => setSaveDefaults(e.target.checked)} className="accent-accent" /> Remember my visa, salary and notice-period answers for next time</label>
        <div><button className={btn} disabled={!!busy} onClick={() => act(a.id + "ans", { action: "answer", id: a.id, answers: Object.fromEntries(qs.map((q, i) => [i, q.answer])), save_defaults: saveDefaults }, "Answers saved.")}>{busy === a.id + "ans" ? "Saving…" : "Save answers"}</button></div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">Cover note</h3><button className={btn} onClick={() => copy("note", note)}>{copied === "note" ? "Copied" : "Copy"}</button></div>
        <textarea id={`note-${a.id}`} rows={6} className={input} value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Tailored CV</h3>
          <div className="flex items-center gap-2">
            <a className={btn} href={`/api/applications/${a.id}/pdf`} target="_blank" rel="noopener noreferrer">Download ATS PDF 📄</a>
            <button className={btn} onClick={() => copy("cv", cv)}>{copied === "cv" ? "Copied" : "Copy"}</button>
          </div>
        </div>
        {(a.cv_changes ?? []).length > 0 && <ul className="list-disc pl-5 text-sm text-muted">{(a.cv_changes ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>}
        <textarea id={`cv-${a.id}`} rows={14} className={input + " font-mono text-[13px]"} value={cv} onChange={(e) => setCv(e.target.value)} />
        <div><button className={btn} disabled={!!busy} onClick={() => act(a.id + "edit", { action: "edit", id: a.id, tailored_cv: cv, cover_note: note }, "Edits saved.")}>{busy === a.id + "edit" ? "Saving…" : "Save edits"}</button></div>
      </section>

      {autoMode !== "off" && <AutoApplyBox a={a} busy={busy} act={act} autoMode={autoMode} />}

      <section className="flex flex-col gap-2 rounded-2xl bg-sunk p-4">
        <h3 className="text-lg font-bold">Submit</h3>
        <p className="text-sm text-muted">Submit automatically via direct ATS API or open the company&apos;s application page to review and confirm.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={btnPrimary + " bg-accent text-white hover:opacity-90"}
            disabled={!!busy || needs}
            title={needs ? "Answer the highlighted questions first" : "Submits directly to ATS API with your tailored ATS PDF resume"}
            onClick={() => act(a.id + "direct", { action: "direct_auto_apply", id: a.id }, "Application submitted directly to ATS! 🎉")}
          >
            {busy === a.id + "direct" ? "Submitting to ATS…" : "⚡ 1-Click Auto-Apply"}
          </button>
          <a className={btn} href={a.jobs?.url} target="_blank" rel="noopener noreferrer">Open application page ↗</a>
          <input id={`rcpt-${a.id}`} className={input + " max-w-xs"} placeholder="Confirmation number or note (optional)" value={receipt} onChange={(e) => setReceipt(e.target.value)} />
          <button className={btn} disabled={!!busy || needs} title={needs ? "Answer the highlighted questions first" : ""}
            onClick={() => act(a.id + "sub", { action: "submitted", id: a.id, receipt }, "Marked as submitted. Good luck!")}>{busy === a.id + "sub" ? "Saving…" : "I submitted it"}</button>
          <button className={btn} disabled={!!busy} onClick={() => act(a.id + "skip", { action: "skip", id: a.id }, "Skipped.")}>Skip this role</button>
        </div>
      </section>
    </div>
  );
}

const RUNNING = ["queued", "running"];

/** Hands this application to the robot browser on your Mac (JobRadar) and shows what happened. */
function AutoApplyBox({ a, busy, act, autoMode }: { a: AppRow; busy: string | null; act: Act; autoMode: AutoMode }) {
  const st = a.auto_status ?? null;
  const practice = autoMode === "dry_run";
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Auto-apply on my Mac</h3>
        {st === "queued" && <Pill tone="accent">Queued</Pill>}
        {st === "running" && <Pill tone="accent">Applying now…</Pill>}
        {st === "filled" && <Pill tone="good">Practice run done</Pill>}
        {st === "needs_you" && <Pill tone="warn">Needs you</Pill>}
        {st === "failed" && <Pill tone="warn">Didn&apos;t work</Pill>}
      </div>
      <p className="text-sm text-muted">
        {practice
          ? "Practice mode: JobRadar opens the real form on your Mac and fills it in, but does not send it. Check it, then switch to Send in Settings."
          : "JobRadar opens the real form on your Mac, fills it in and sends it. It stops and tells you if anything needs you (CAPTCHA, login, a question it must not guess)."}
      </p>
      {a.auto_log && st !== "queued" && <p className="rounded-xl bg-surface px-3 py-2 text-sm">{a.auto_log}</p>}
      <div className="flex flex-wrap gap-2">
        {st && RUNNING.includes(st) ? (
          st === "queued" && <button className={btn} disabled={!!busy} onClick={() => act(a.id + "unq", { action: "unqueue_auto", id: a.id }, "Taken out of the auto-apply queue.")}>Take out of queue</button>
        ) : (
          <button className={btnPrimary} disabled={!!busy} onClick={() => act(a.id + "queue", { action: "queue_auto", id: a.id }, "Queued. JobRadar will pick it up within about 30 minutes.")}>
            {busy === a.id + "queue" ? "Queuing…" : st === "needs_you" || st === "failed" || st === "filled" ? "Queue again" : practice ? "Queue a practice run" : "Auto-apply on my Mac"}
          </button>
        )}
      </div>
    </section>
  );
}
