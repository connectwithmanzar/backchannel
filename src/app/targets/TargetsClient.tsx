"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, btn, btnPrimary } from "@/components/ui";
import { STRATEGIES, STRATEGY_LABEL, cleanStrategy, planOf, type Strategy } from "@/lib/target-plan";

export interface TargetRow {
  id: string; job_id: string | null; company: string; title: string; url: string; source: string;
  strategy: string; steps: unknown; notes: string; created_at: string;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, error: String(data.error ?? "Something went wrong.") };
  } catch { return { ok: false, error: "Couldn't reach the server. Check your connection." }; }
}

export default function TargetsClient({ initial, needsMigration }: { initial: TargetRow[]; needsMigration: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(needsMigration ? { ok: false, text: "The Target list needs one database update first. Run supabase/migrations/0022_targets.sql in Supabase (SQL Editor, paste, Run), then reload." } : null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ company: "", title: "" });

  async function addLink() {
    if (!link.trim() && !(manual.company.trim() && manual.title.trim())) { setMsg({ ok: false, text: "Paste a job link, or fill in a company and a role." }); return; }
    setBusy(true); setMsg(null);
    let title = manual.title, company = manual.company;
    if (link.trim() && !(title && company)) {
      // Read the page for its title and company; if that fails the link is still saved.
      try {
        const res = await fetch("/api/jobs/fetch-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link.trim() }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) { title = title || String(d.title ?? ""); company = company || String(d.company ?? ""); }
        else if (res.status === 400 && d.error) { setBusy(false); setMsg({ ok: false, text: String(d.error) }); return; }
      } catch { /* saved without details */ }
    }
    const r = await post({ action: "add_link", url: link.trim(), title, company });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? "Couldn't add it." }); return; }
    setMsg({ ok: true, text: r.existed ? "That role is already on your list." : "Added to your Target list." });
    setLink(""); setManual({ company: "", title: "" });
    router.refresh();
    // Reload the list so the new row appears with its real id.
    const res = await fetch("/api/targets/list", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setRows(((await res.json()) as { rows: TargetRow[] }).rows);
  }

  async function toggle(t: TargetRow, step: string, done: boolean) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, steps: { ...(r.steps as object), [step]: done } } : r)));
    const r = await post({ action: "toggle", id: t.id, step, done });
    if (!r.ok) { setRows(prev); setMsg({ ok: false, text: r.error ?? "Couldn't save that step." }); }
  }

  async function strategy(t: TargetRow, s: Strategy) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, strategy: s } : r)));
    const r = await post({ action: "strategy", id: t.id, strategy: s });
    if (!r.ok) { setRows(prev); setMsg({ ok: false, text: r.error ?? "Couldn't change the plan." }); }
  }

  async function remove(t: TargetRow) {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== t.id));
    const r = await post({ action: "remove", id: t.id });
    if (!r.ok) { setRows(prev); setMsg({ ok: false, text: r.error ?? "Couldn't remove it." }); }
  }

  async function saveNotes(t: TargetRow, notes: string) {
    if (notes === t.notes) return;
    const r = await post({ action: "notes", id: t.id, notes });
    if (r.ok) setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, notes } : x)));
    else setMsg({ ok: false, text: r.error ?? "Couldn't save your notes." });
  }

  return (
    <div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-4 rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}

      <Card className="mb-6 flex flex-col gap-3">
        <h2 className="text-2xl">Add a role</h2>
        <p className="text-sm text-muted">Paste a link to a job from anywhere (a company site, LinkedIn, a job board), or type the company and role yourself.</p>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… link to the job" aria-label="Job link" className="rounded-full border border-line bg-surface px-5 py-3 text-sm" />
        <div className="flex flex-wrap gap-2">
          <input value={manual.company} onChange={(e) => setManual({ ...manual, company: e.target.value })} placeholder="Company (optional with a link)" aria-label="Company" className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 text-sm" />
          <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="Role title (optional with a link)" aria-label="Role title" className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 text-sm" />
        </div>
        <div><button type="button" className={btnPrimary} onClick={addLink} disabled={busy}>{busy ? "Adding…" : "Add to Target list"}</button></div>
      </Card>

      {rows.length === 0 ? (
        <Card><p className="text-sm text-muted">Nothing here yet. On <Link href="/swipe" className="font-semibold text-accent">Swipe</Link>, tap the star on a role you really want, or add one above.</p></Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((t) => {
            const plan = planOf(cleanStrategy(t.strategy), t.steps);
            const q = encodeURIComponent(t.company);
            return (
              <li key={t.id}>
                <Card className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-muted">{t.company || "Company not set"}</p>
                      <h2 className="text-2xl leading-snug">{t.job_id ? <Link href={`/roles/${t.job_id}`} className="hover:underline">{t.title}</Link> : t.title}</h2>
                    </div>
                    <div className="text-right text-sm text-muted">{plan.done} of {plan.total} steps{plan.readyToApply ? " · ready to apply" : ""}</div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={plan.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Plan progress"><div className="h-full rounded-full bg-accent" style={{ width: `${plan.percent}%` }} /></div>

                  <div className="flex flex-wrap gap-2" role="group" aria-label="Strategy">
                    {STRATEGIES.map((s) => (
                      <button key={s} type="button" onClick={() => strategy(t, s)} title={STRATEGY_LABEL[s].blurb} aria-pressed={cleanStrategy(t.strategy) === s}
                        className={`rounded-full px-4 py-1.5 text-sm font-semibold ${cleanStrategy(t.strategy) === s ? "bg-fg text-bg" : "border border-line bg-surface"}`}>{STRATEGY_LABEL[s].name}</button>
                    ))}
                  </div>

                  <ol className="flex flex-col gap-2">
                    {plan.steps.map((s) => (
                      <li key={s.key} className={`rounded-2xl border p-3 ${plan.next === s.key ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="checkbox" checked={s.done} onChange={(e) => toggle(t, s.key, e.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
                          <span className="min-w-0 flex-1">
                            <span className={`font-semibold ${s.done ? "text-muted line-through" : ""}`}>{s.title}</span>
                            <span className="mt-0.5 block text-sm text-muted">{s.how}</span>
                          </span>
                        </label>
                        {!s.done && (
                          <div className="ml-7 mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                            {s.key === "referral" && <Link href={`/referrals?company=${q}&role=${encodeURIComponent(t.title)}`} className="text-accent">Find people →</Link>}
                            {s.key === "linkedin" && <Link href={`/referrals?company=${q}&role=${encodeURIComponent(t.title)}`} className="text-accent">Find who to connect with →</Link>}
                            {s.key === "email" && <Link href={`/outreach`} className="text-accent">Open Messages →</Link>}
                            {s.key === "research" && t.company && <a href={`https://www.google.com/search?q=${q}+news`} target="_blank" rel="noopener noreferrer" className="text-accent">Search news ↗</a>}
                            {s.key === "apply" && (t.job_id ? <Link href={`/roles/${t.job_id}`} className="text-accent">Open the job and apply →</Link> : t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-accent">Open the posting ↗</a> : null)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>

                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-muted">Notes</span>
                    <textarea defaultValue={t.notes} rows={2} onBlur={(e) => saveNotes(t, e.target.value)} placeholder="Who you asked, what you noticed, what to mention…" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm" />
                  </label>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="flex gap-3">
                      {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent">Original posting ↗</a>}
                    </span>
                    <button type="button" className={btn} onClick={() => remove(t)}>Remove</button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
