"use client";
import { useState } from "react";
import { Pill, btn, btnPrimary, input } from "@/components/ui";
import { copyText } from "@/lib/api";

export type Q = { q: string; answer: string; sensitive: boolean; key?: string };

export interface AppRow {
  id: string; job_id: string; status: string; stage: string | null; tailored_cv: string | null; cover_note: string | null;
  cv_changes: string[] | null; questions: Q[] | null; receipt: string | null; submitted_at: string | null; notes: string | null;
  jobs: { title: string; url: string; location: string; companies: { name: string } | null } | null;
}

export type Act = (key: string, body: object, ok: string, after?: () => void) => Promise<void>;

/** Form answers, cover note, tailored CV and the submit step for one prepared application. Used on the job page and in Applications. */
export default function ApplyReview({ a, busy, act }: { a: AppRow; busy: string | null; act: Act }) {
  const [qs, setQs] = useState<Q[]>(a.questions ?? []);
  const [cv, setCv] = useState(a.tailored_cv ?? "");
  const [note, setNote] = useState(a.cover_note ?? "");
  const [saveDefaults, setSaveDefaults] = useState(true);
  const [receipt, setReceipt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const needs = a.status === "needs_answer";
  const copy = async (k: string, t: string) => { if (await copyText(t)) { setCopied(k); setTimeout(() => setCopied(null), 1500); } };

  return (
    <div className="flex flex-col gap-5">
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

      <section className="flex flex-col gap-2 rounded-2xl bg-sunk p-4">
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
  );
}
