"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Empty, Pill, btn, btnPrimary, input, label } from "@/components/ui";
import { postJson } from "@/lib/api";
import { SENSITIVE_LABELS } from "@/lib/apps/labels";
import { CONTACT_FIELDS, MODE_LABELS, type AutoMode, AUTO_MODES } from "@/lib/auto-apply";
import ApplyReview, { type AppRow, type Act } from "@/components/ApplyReview";
import ApplicationKanban from "@/components/ApplicationKanban";
import FollowUpRadar from "@/components/FollowUpRadar";

export type { AppRow };

export interface Suggestion { job_id: string; score: number; bookmarked: boolean; explanation: string; title: string; url: string; location: string; company: string }

const STAGES = [["applied", "Applied"], ["screening", "Screening"], ["interview", "Interview"], ["final", "Final round"], ["offer", "Offer"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"]];

export default function AutopilotClient({ apps, suggestions, settings, savedAnswers, hasCv, aiReady }: {
  apps: AppRow[]; suggestions: Suggestion[]; settings: { mode: "ask" | "auto"; minFit: number; cap: number; autoMode: AutoMode; autoCap: number; autoUseSaved: boolean };
  savedAnswers: Record<string, string>; hasCv: boolean; aiReady: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"todo" | "review" | "applied" | "settings">(apps.some((a) => a.status === "needs_answer" || a.status === "awaiting_approval") ? "review" : "todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const review = apps.filter((a) => a.status === "needs_answer" || a.status === "awaiting_approval");
  const applied = apps.filter((a) => a.status === "submitted");

  const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
  const staleApps = applied
    .filter((a) => {
      const subTime = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      return subTime > 0 && subTime < fourDaysAgo && (!a.stage || a.stage === "applied" || a.stage === "screening");
    })
    .map((a) => ({
      id: a.id,
      company: a.jobs?.companies?.name || "Company",
      roleTitle: a.jobs?.title || "Role",
      submittedAt: a.submitted_at || new Date().toISOString(),
      stage: a.stage || "applied",
    }));

  async function act(key: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson("/api/applications", body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  async function queueAll() {
    setBusy("qall"); setMsg(null);
    try {
      const d = await postJson<{ queued: number; blocked: number }>("/api/applications", { action: "queue_all" });
      setMsg({ ok: true, text: `Queued ${d.queued} for auto-apply.${d.blocked ? ` ${d.blocked} still need your answers first.` : ""}` });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
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

      <FollowUpRadar staleApps={staleApps} />

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
        <div className="flex flex-col gap-3">
          {settings.autoMode !== "off" && (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Auto-apply is on ({MODE_LABELS[settings.autoMode].toLowerCase()}). Send every ready application to JobRadar in one go.</p>
              <button className={btnPrimary} disabled={!!busy} onClick={queueAll}>{busy === "qall" ? "Queuing…" : "Queue all ready applications"}</button>
            </Card>
          )}
          <ul className="flex flex-col gap-3">
            {review.map((a) => <ReviewItem key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} busy={busy} act={act} autoMode={settings.autoMode} />)}
          </ul>
        </div>
      ) : <Empty>Nothing to review. Prepare an application from Ready to prepare.</Empty>)}

      {tab === "applied" && (applied.length ? (
        <ApplicationKanban apps={applied} busy={busy} act={act} />
      ) : <Empty>Applications you submit show up here, so you can track each one through to an offer.</Empty>)}

      {tab === "settings" && <Settings settings={settings} saved={savedAnswers} busy={busy} act={act} />}
    </div>
  );
}

function ReviewItem({ a, open, onToggle, busy, act, autoMode }: {
  a: AppRow; open: boolean; onToggle: () => void; busy: string | null; act: Act; autoMode: AutoMode;
}) {
  const needs = a.status === "needs_answer";
  return (
    <li><Card>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="min-w-0"><div className="font-bold">{a.jobs?.title}</div><div className="text-sm text-muted">{a.jobs?.companies?.name} · {a.jobs?.location}</div></div>
        {a.auto_status === "queued" ? <Pill tone="accent">Queued for auto-apply</Pill> : a.auto_status === "needs_you" ? <Pill tone="warn">Auto-apply needs you</Pill> : needs ? <Pill tone="warn">Confirm your answers</Pill> : <Pill tone="good">Ready to submit</Pill>}
      </button>
      {open && <div className="mt-4 border-t border-line pt-4"><ApplyReview a={a} busy={busy} act={act} autoMode={autoMode} /></div>}
    </Card></li>
  );
}

function Settings({ settings, saved, busy, act }: {
  settings: { mode: "ask" | "auto"; minFit: number; cap: number; autoMode: AutoMode; autoCap: number; autoUseSaved: boolean }; saved: Record<string, string>; busy: string | null;
  act: (k: string, b: object, ok: string) => Promise<void>;
}) {
  const [mode, setMode] = useState(settings.mode);
  const [minFit, setMinFit] = useState(settings.minFit);
  const [cap, setCap] = useState(settings.cap);
  const [answers, setAnswers] = useState<Record<string, string>>(saved);
  const [autoMode, setAutoMode] = useState<AutoMode>(settings.autoMode);
  const [autoCap, setAutoCap] = useState(settings.autoCap);
  const [useSaved, setUseSaved] = useState(settings.autoUseSaved);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="flex flex-col gap-4 md:col-span-2">
        <h3 className="text-lg font-bold">Auto-apply on my Mac</h3>
        <p className="text-sm text-muted">JobRadar, on your Mac, opens each company&apos;s real application form in a browser, fills it in from your tailored CV and saved details, and can send it. It stops and tells you when something needs you: a CAPTCHA, a login, or a question it must not guess. Start with Practice.</p>
        {AUTO_MODES.map((m) => (
          <label key={m} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3">
            <input type="radio" name="automode" checked={autoMode === m} onChange={() => setAutoMode(m)} className="mt-1 accent-accent" />
            <span><b>{MODE_LABELS[m]}</b></span>
          </label>
        ))}
        <label className="flex flex-col gap-1"><span className={label}>Send at most <span className="num">{autoCap}</span> applications a day</span>
          <input type="range" min={1} max={100} value={autoCap} onChange={(e) => setAutoCap(+e.target.value)} className="accent-accent" />
          {autoCap > 30 && <span className="text-sm text-signal">Above about 30 a day, applications get less specific and job sites are more likely to block you. Quality beats volume.</span>}
        </label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={useSaved} onChange={(e) => setUseSaved(e.target.checked)} className="mt-1 accent-accent" />
          <span><b>Use my saved answers without asking each time.</b> Visa, salary, notice period and similar questions are filled only from the answers you saved on the right, never guessed. Anything without a saved answer still stops and asks you.</span></label>
        <div><button className={btnPrimary} disabled={!!busy} onClick={() => act("autoset", { action: "settings", auto_apply_mode: autoMode, auto_apply_daily_cap: autoCap, auto_apply_use_saved: useSaved }, "Auto-apply settings saved.")}>Save auto-apply settings</button></div>
      </Card>
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
        <h3 className="text-lg font-bold">Saved details and answers</h3>
        <p className="text-sm text-muted">Autopilot never guesses these. It fills them from here, or asks you.</p>
        {Object.entries(CONTACT_FIELDS).map(([k, l]) => (
          <label key={k} className="flex flex-col gap-1"><span className="text-sm font-semibold">{l}</span>
            <input id={`sa-${k}`} className={input} value={answers[k] ?? ""} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
          </label>
        ))}
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
