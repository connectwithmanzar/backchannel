"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FitRing from "@/components/FitRing";
import { Card, Pill, btn, btnPrimary } from "@/components/ui";import { oneTapApply, outcomeLine, type ApplicationsCall, type ApplyOutcome } from "@/lib/one-tap-apply";
import type { SwipeJob } from "@/lib/jobs/swipe-feed";
import { matchLabel } from "@/lib/match-label";
import { swipeDecision, swipeProgress, tiltFor } from "@/lib/swipe-gesture";

const UNDO_SECONDS = 4;

const call: ApplicationsCall = async (body) => {
  const res = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

async function react(jobId: string, reaction: "skipped" | "bookmarked" | null): Promise<boolean> {
  try {
    const res = await fetch("/api/job-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: jobId, reaction }) });
    return res.ok;
  } catch { return false; }
}

const posted = (iso: string | null) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return days <= 0 ? "Posted today" : days === 1 ? "1 day ago" : `${days} days ago`;
};

type Done = { job: SwipeJob; outcome: ApplyOutcome };
type Undoable = { job: SwipeJob; kind: "pass" | "save" };

export default function SwipeDeck({ initial, view }: { initial: SwipeJob[]; view: "swipe" | "grid" }) {
  const [deck, setDeck] = useState(initial);
  const [pending, setPending] = useState<{ job: SwipeJob; left: number } | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [last, setLast] = useState<Undoable | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stopTimer, []);

  const runApply = useCallback(async (job: SwipeJob) => {
    const outcome = await oneTapApply(job.id, call);
    setDone((d) => [{ job, outcome }, ...d].slice(0, 12));
  }, []);

  /** Tapping Apply starts a short countdown; Undo cancels it. When it ends the application is prepared and sent. */
  const apply = useCallback((job: SwipeJob) => {
    if (pending) return;
    setError(""); setLast(null);
    setDeck((d) => d.filter((j) => j.id !== job.id));
    setPending({ job, left: UNDO_SECONDS });
    stopTimer();
    let left = UNDO_SECONDS;
    timer.current = setInterval(() => {
      left -= 1;
      if (left > 0) { setPending({ job, left }); return; }
      stopTimer();
      setPending(null);
      void runApply(job);
    }, 1000);
  }, [pending, runApply]);

  const undoApply = () => {
    if (!pending) return;
    stopTimer();
    setDeck((d) => [pending.job, ...d]);
    setPending(null);
  };

  const pass = useCallback(async (job: SwipeJob) => {
    setError("");
    setDeck((d) => d.filter((j) => j.id !== job.id));
    setLast({ job, kind: "pass" });
    if (!(await react(job.id, "skipped"))) setError("Couldn't save that pass. Check your connection.");
  }, []);

  const save = useCallback(async (job: SwipeJob) => {
    setError("");
    setDeck((d) => d.filter((j) => j.id !== job.id));
    setLast({ job, kind: "save" });
    if (!(await react(job.id, "bookmarked"))) setError("Couldn't save that job. Check your connection.");
  }, []);

  const undoLast = useCallback(async () => {
    if (!last) return;
    setDeck((d) => [last.job, ...d]);
    const l = last;
    setLast(null);
    if (!(await react(l.job.id, null))) setError("Couldn't undo that. Check your connection.");
  }, [last]);

  const q = query.trim().toLowerCase();
  const visible = q ? deck.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)) : deck;
  const current = visible[0] ?? null;

  const onDown = (e: React.PointerEvent) => {
    if (pending) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onUp = () => {
    if (!start.current) return;
    const decision = swipeDecision(drag.x, drag.y);
    start.current = null;
    setDrag({ x: 0, y: 0, active: false });
    if (!current) return;
    if (decision === "apply") apply(current);
    else if (decision === "pass") void pass(current);
    else if (decision === "save") void save(current);
  };
  const pull = swipeProgress(drag.x, drag.y);
  const hint = drag.active ? swipeDecision(drag.x * 3, drag.y * 3) : null;

  // Keyboard: left passes, right applies, up saves, Z undoes. Ignored while typing.
  useEffect(() => {
    if (view !== "swipe") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(input|textarea|select)$/i.test(t.tagName))) return;
      if (e.key === "ArrowLeft" && current) { e.preventDefault(); void pass(current); }
      else if (e.key === "ArrowRight" && current) { e.preventDefault(); apply(current); }
      else if (e.key === "ArrowUp" && current) { e.preventDefault(); void save(current); }
      else if (e.key.toLowerCase() === "z") { e.preventDefault(); if (pending) undoApply(); else void undoLast(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const actions = (job: SwipeJob, size: "lg" | "sm") => (
    <div className={`flex flex-wrap items-center gap-2 ${size === "lg" ? "mt-4" : "mt-3"}`}>
      <button type="button" className={btn} onClick={() => void pass(job)} disabled={!!pending}>Pass{size === "lg" ? " ←" : ""}</button>
      <button type="button" className={btn} onClick={() => void save(job)} disabled={!!pending}>Save{size === "lg" ? " ↑" : ""}</button>
      <button type="button" className={btnPrimary} onClick={() => apply(job)} disabled={!!pending}>Apply{size === "lg" ? " →" : ""}</button>
    </div>
  );

  const meta = (j: SwipeJob) => [j.location, j.workMode, j.level, j.pay ?? "Pay not published", posted(j.postedAt)].filter(Boolean);

  return (
    <div>
      {view === "swipe" && deck.length > 0 && (
        <div className="mb-5">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Job title, company or city" aria-label="Search these roles"
            className="w-full rounded-full border border-line bg-surface px-5 py-3 text-sm" />
        </div>
      )}
      {error && <p role="alert" className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}

      {deck.length === 0 && !pending ? (
        <Card><p className="text-sm text-muted">You&apos;ve been through every relevant role for now. New ones arrive every morning. You can also <Link href="/roles" className="font-semibold text-accent">browse the full list</Link>.</p></Card>
      ) : view === "swipe" && !current ? (
        <Card><p className="text-sm text-muted">No roles match &ldquo;{query}&rdquo;. <button type="button" className="font-semibold text-accent" onClick={() => setQuery("")}>Clear search</button></p></Card>
      ) : view === "swipe" && current ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          <div>
            <div className="relative mx-auto max-w-md pb-3">
              <div className="absolute inset-x-6 top-3 h-full rounded-3xl border border-line bg-surface opacity-60" aria-hidden="true" />
              <div className="absolute inset-x-3 top-1.5 h-full rounded-3xl border border-line bg-surface opacity-80" aria-hidden="true" />
              <article
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                style={{ transform: `translate(${drag.x}px, ${Math.min(0, drag.y)}px) rotate(${tiltFor(drag.x)}deg)`, transition: drag.active ? "none" : "transform 0.2s ease", touchAction: "pan-y" }}
                className="relative cursor-grab select-none rounded-3xl border border-line bg-surface p-5 shadow-sm active:cursor-grabbing"
                aria-label={`${current.title} at ${current.company}`}
              >
                {hint && (
                  <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-sm font-semibold text-white ${hint === "apply" ? "bg-good" : hint === "pass" ? "bg-warn" : "bg-accent"}`} style={{ opacity: pull }}>
                    {hint === "apply" ? "Apply" : hint === "pass" ? "Pass" : "Save"}
                  </span>
                )}
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-bg text-xl font-semibold text-muted" aria-hidden="true">{current.company.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted">{current.company}{current.tier ? ` · Tier ${current.tier}` : ""}</p>
                    <h2 className="mt-0.5 text-3xl leading-tight">{current.title}</h2>
                  </div>
                </div>
                <p className="mt-3"><span className="inline-block rounded-full bg-signal-soft px-3 py-1 text-sm font-medium text-signal">{current.score}% match · {matchLabel(current.score)}</span></p>
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted" aria-label="Job facts">
                  {meta(current).map((m) => <li key={m}>{m}</li>)}
                </ul>
                <div className="mt-5 rounded-2xl bg-sunk p-4 text-sm">
                  <p className="eyebrow text-muted">Why it fits</p>
                  {current.reasons.length + current.caveats.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {current.reasons.slice(0, 4).map((r) => <li key={r} className="flex gap-2"><span className="text-good" aria-hidden="true">✓</span><span>{r[0].toUpperCase() + r.slice(1)}</span></li>)}
                      {current.caveats.slice(0, 3).map((c) => <li key={c} className="flex gap-2"><span className="text-signal" aria-hidden="true">!</span><span className="text-muted">{c[0].toUpperCase() + c.slice(1)}</span></li>)}
                    </ul>
                  ) : <p className="mt-2">{current.why}</p>}
                </div>
                {current.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{current.tags.map((t) => <Pill key={t}>{t}</Pill>)}</div>}
              </article>
            </div>

            <div className="mt-5 flex items-center justify-center gap-5">
              <button type="button" onClick={() => void pass(current)} disabled={!!pending} aria-label="Pass (left arrow)" className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface text-2xl text-warn shadow-sm hover:bg-sunk disabled:opacity-50">✕</button>
              <button type="button" onClick={() => void save(current)} disabled={!!pending} aria-label="Save (up arrow)" className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface text-xl shadow-sm hover:bg-sunk disabled:opacity-50">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z" /></svg>
              </button>
              <button type="button" onClick={() => apply(current)} disabled={!!pending} aria-label="Apply (right arrow)" className="flex h-20 w-20 items-center justify-center rounded-full bg-fg text-3xl text-bg shadow-md hover:opacity-90 disabled:opacity-50">✓</button>
            </div>
            <p className="mt-4 text-center text-xs text-muted">{visible.length} left · Drag the card, or use ← pass, ↑ save, → apply, Z undo</p>
            {last && !pending && <p className="mt-2 text-center"><button type="button" className="text-sm font-semibold text-accent" onClick={() => void undoLast()}>Undo {last.kind === "pass" ? "pass" : "save"}</button></p>}
          </div>

          <Card className="sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-muted">Job details</p>
              <span className="flex gap-3 text-sm font-semibold">
                <Link href={`/roles/${current.id}`} className="text-accent">Open page</Link>
                {current.url && <a href={current.url} target="_blank" rel="noopener noreferrer" className="text-accent">Original posting ↗</a>}
              </span>
            </div>
            <h3 className="mt-2 text-2xl">{current.title}</h3>
            <p className="text-sm text-muted">{current.company}</p>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{current.description || "No description was collected for this role. Open the original posting to read it."}</p>
          </Card>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deck.slice(0, 60).map((j) => (
            <li key={j.id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-sm text-muted">{j.company}</p><h3 className="text-lg font-bold leading-snug"><Link href={`/roles/${j.id}`} className="hover:underline">{j.title}</Link></h3></div>
                  <FitRing score={j.score} size={52} />
                </div>
                <p className="mt-2 text-sm text-muted">{meta(j).slice(0, 4).join(" · ")}</p>
                <p className="mt-2 line-clamp-3 text-sm">{j.why}</p>
                <div className="mt-auto">{actions(j, "sm")}</div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-md flex-col gap-2 px-4 md:bottom-6" aria-live="polite">
        {pending && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-bg shadow-lg">
            <span>Applying to {pending.job.title} at {pending.job.company} in {pending.left}s</span>
            <button type="button" className="rounded-lg bg-bg px-3 py-1.5 font-semibold text-fg" onClick={undoApply}>Undo</button>
          </div>
        )}
      </div>

      {done.length > 0 && (
        <section className="mt-8" aria-label="What happened to your applications">
          <h2 className="text-lg font-semibold">Your applications, just now</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {done.map(({ job, outcome }) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <span><b>{job.title}</b> <span className="text-muted">· {job.company}</span></span>
                <span className="flex items-center gap-3">
                  <Pill tone={outcome.kind === "submitted" ? "good" : outcome.kind === "queued" ? "accent" : "warn"}>{outcome.kind === "submitted" ? "Applied" : outcome.kind === "queued" ? "Queued" : outcome.kind === "needs_you" ? "Needs you" : "Couldn't apply"}</Pill>
                  <span className="max-w-md text-muted">{outcomeLine(outcome)}</span>
                  {(outcome.kind === "needs_you" || outcome.kind === "failed") && <Link href={`/roles/${job.id}`} className="font-semibold text-accent">Open job</Link>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
