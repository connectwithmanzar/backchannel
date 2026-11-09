"use client";
import { useMemo, useState, useTransition } from "react";
import type { ScoredJob } from "@/lib/score";

const MARKETS: Record<string, string> = {
  india: "India",
  "remote-in": "Remote (India)",
  emea: "EMEA",
  us: "US",
  global: "Global / remote",
};
const PAGE_SIZE = 40;
const FAMILIES = ["SDR/BDR", "GTM Engineer", "Account Executive", "Sales leadership"];

export interface JobReaction {
  job_id: string;
  reaction: "bookmarked" | "skipped" | "applied" | null;
  score?: number;
  explanation?: string;
  model?: string;
}

function money(n?: number, cur?: string) {
  if (!n || !cur) return "";
  if (cur === "INR") return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")} L`;
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  return `${sym[cur] ?? cur + " "}${Math.round(n / 1000)}k`;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
        on ? "border-fg bg-fg text-bg" : "border-line bg-surface hover:border-fg/40"
      }`}
    >
      {children}
    </button>
  );
}

function ReactionButton({
  icon, label, active, danger, onClick,
}: {
  icon: string; label: string; active: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        danger && active
          ? "border-warn bg-warn-soft text-warn"
          : active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line text-muted hover:border-fg/30"
      }`}
    >
      <span>{icon}</span> {label}
    </button>
  );
}

export default function RolesFeed({
  jobs,
  reactions: initialReactions = {},
}: {
  jobs: ScoredJob[];
  reactions?: Record<string, JobReaction>;
}) {
  const [markets, setMarkets] = useState<Set<string>>(new Set());
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [payOnly, setPayOnly] = useState(false);
  const [minUsd, setMinUsd] = useState(0);
  const [sort, setSort] = useState<"fit" | "pay" | "new">("fit");
  const [open, setOpen] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [reactions, setReactions] = useState<Record<string, JobReaction>>(initialReactions);
  const [, startTransition] = useTransition();

  const toggle = (s: Set<string>, set: (x: Set<string>) => void, k: string) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    set(n);
  };

  async function setReaction(jobId: string, reaction: "bookmarked" | "skipped" | "applied" | null) {
    startTransition(() => {
      setReactions((prev) => ({ ...prev, [jobId]: { ...prev[jobId], job_id: jobId, reaction } }));
    });
    await fetch("/api/job-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, reaction }),
    });
  }

  const [prep, setPrep] = useState<Record<string, string>>({});
  const [prepBusy, setPrepBusy] = useState<string | null>(null);
  async function loadPrep(jobId: string, refresh = false) {
    setPrepBusy(jobId);
    try {
      const res = await fetch("/api/prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: jobId, refresh }) });
      const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
      setPrep((p) => ({ ...p, [jobId]: res.ok ? data.content : `Couldn't prepare: ${data.error ?? "try again"}` }));
    } finally { setPrepBusy(null); }
  }

  async function removePasted(jobId: string) {
    const res = await fetch(`/api/jobs/paste?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
    if (res.ok) window.location.reload();
  }

  const rows = useMemo(() => {
    const r = jobs.filter((j) => {
      const rxn = reactions[j.id]?.reaction;
      if (!showSkipped && rxn === "skipped") return false;
      return (
        (!markets.size || markets.has(j.market)) &&
        (!families.size || families.has(j.roleFamily)) &&
        (!remoteOnly || j.remoteType === "remote") &&
        (!payOnly || j.payBandStatus === "verified") &&
        (!minUsd || (j.payUsdMax ?? 0) >= minUsd)
      );
    });
    if (sort === "pay") r.sort((a, b) => (b.payUsdMax ?? 0) - (a.payUsdMax ?? 0));
    else if (sort === "new") r.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
    else
      r.sort((a, b) => {
        const ab = reactions[a.id]?.reaction === "bookmarked" ? 1 : 0;
        const bb = reactions[b.id]?.reaction === "bookmarked" ? 1 : 0;
        if (bb !== ab) return bb - ab;
        return b.score - a.score;
      });
    return r;
  }, [jobs, markets, families, remoteOnly, payOnly, minUsd, sort, showSkipped, reactions]);

  const skippedCount = Object.values(reactions).filter((r) => r.reaction === "skipped").length;

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
      {/* Filters */}
      <aside className="flex min-w-0 flex-col gap-5" aria-label="Filters">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Market</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MARKETS).map(([k, v]) => (
              <Chip key={k} on={markets.has(k)} onClick={() => toggle(markets, setMarkets, k)}>{v}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Role type</span>
          <div className="flex flex-wrap gap-1.5">
            {FAMILIES.map((f) => (
              <Chip key={f} on={families.has(f)} onClick={() => toggle(families, setFamilies, f)}>{f}</Chip>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Min pay (USD) <span className="num">{minUsd ? `$${minUsd / 1000}k+` : "any"}</span>
          </span>
          <input type="range" min={0} max={200000} step={10000} value={minUsd} onChange={(e) => setMinUsd(+e.target.value)} className="accent-accent" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="accent-accent" />
          Remote only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={payOnly} onChange={(e) => setPayOnly(e.target.checked)} className="accent-accent" />
          Published pay only
        </label>
        {skippedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showSkipped} onChange={(e) => setShowSkipped(e.target.checked)} className="accent-accent" />
            Show {skippedCount} skipped
          </label>
        )}
      </aside>

      {/* Feed */}
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span className="num">{rows.length} of {jobs.length} roles</span>
          <label>Sort{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-line bg-surface px-2 py-1">
              <option value="fit">Best fit</option>
              <option value="pay">Highest pay</option>
              <option value="new">Newest</option>
            </select>
          </label>
        </div>
        {rows.length === 0 && (
          <div className="rounded-card border border-dashed border-line p-10 text-center text-muted">
            No roles match these filters. Try clearing a market or lowering the minimum pay.
          </div>
        )}
        <ul className="flex flex-col gap-2.5">
          {rows.slice(0, limit).map((j) => {
            const isOpen = open === j.id;
            const rxn = reactions[j.id]?.reaction ?? null;
            const aiExplanation = reactions[j.id]?.explanation;
            const isSkipped = rxn === "skipped";

            return (
              <li
                key={j.id}
                className={`rounded-card border bg-surface transition-opacity ${
                  isOpen ? "border-accent" : "border-line"
                } ${isSkipped ? "opacity-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : j.id)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-1 gap-x-4 gap-y-1.5 p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-bold">{j.title}</h3>
                    <div className="text-sm text-muted">{j.company} · {j.location}</div>
                  </div>
                  <div className="sm:text-right">
                    <b className="font-display text-xl num">
                      {j.payMax ? `${money(j.payMin, j.currency)}–${money(j.payMax, j.currency)}` : "Pay not published"}
                    </b>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                    <span className="rounded-md bg-signal-soft px-2 py-0.5 text-xs font-semibold capitalize text-signal">
                      Careers · {j.board}
                    </span>
                    <span className="rounded-md bg-sunk px-2 py-0.5 text-xs">{j.roleFamily}</span>
                    <span className="rounded-md bg-sunk px-2 py-0.5 text-xs capitalize">{j.remoteType}</span>
                    {j.visaSponsorship !== "unknown" && (
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        j.visaSponsorship === "yes" ? "bg-good-soft text-good" : "bg-warn-soft text-warn"
                      }`}>
                        {j.visaSponsorship === "yes" ? "Visa ✓" : "No sponsorship"}
                      </span>
                    )}
                    {rxn === "bookmarked" && (
                      <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Saved</span>
                    )}
                    {rxn === "applied" && (
                      <span className="rounded-md bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">Applied</span>
                    )}
                    <span className="ml-1 inline-flex items-center gap-1.5 text-[13px] font-semibold num">
                      Fit {j.score}%
                      <i className="relative block h-1.5 w-11 overflow-hidden rounded bg-sunk">
                        <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${j.score}%` }} />
                      </i>
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-line p-4">
                    {/* Score breakdown */}
                    <div className="grid grid-cols-[90px_1fr_40px] items-center gap-x-3 gap-y-2 text-sm num">
                      {j.parts.map((p) => (
                        <div key={p.label} className="contents">
                          <span>{p.label}</span>
                          <div className="h-2 overflow-hidden rounded bg-sunk">
                            <span className="block h-full bg-accent" style={{ width: `${p.value}%` }} />
                          </div>
                          <span>{p.value}%</span>
                        </div>
                      ))}
                    </div>
                    {/* Explanation */}
                    <p className="text-sm">
                      {aiExplanation ?? j.explanation}
                      {aiExplanation && reactions[j.id]?.model === "claude-haiku-5-5" && (
                        <span className="ml-2 rounded bg-sunk px-1.5 py-0.5 text-[11px] text-muted">AI</span>
                      )}
                    </p>
                    {/* Description excerpt */}
                    {j.description && (
                      <p className="line-clamp-5 whitespace-pre-line text-sm text-muted">{j.description}</p>
                    )}
                    {prep[j.id] && (
                      <div className="rounded-lg border border-line bg-sunk p-3">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                          Interview prep
                          <button type="button" className="font-semibold normal-case text-accent hover:underline" disabled={prepBusy === j.id} onClick={() => loadPrep(j.id, true)}>Write it again</button>
                        </div>
                        <p className="whitespace-pre-line text-sm">{prep[j.id]}</p>
                      </div>
                    )}
                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <a href={j.url} target="_blank" rel="noopener noreferrer"
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
                        Open job ↗
                      </a>
                      <ReactionButton icon="🔖" label={rxn === "bookmarked" ? "Saved" : "Save"}
                        active={rxn === "bookmarked"}
                        onClick={() => setReaction(j.id, rxn === "bookmarked" ? null : "bookmarked")} />
                      <ReactionButton icon="✓" label={rxn === "applied" ? "Applied" : "Mark applied"}
                        active={rxn === "applied"}
                        onClick={() => setReaction(j.id, rxn === "applied" ? null : "applied")} />
                      <ReactionButton icon="✕" label="Skip" active={rxn === "skipped"} danger
                        onClick={() => setReaction(j.id, rxn === "skipped" ? null : "skipped")} />
                      <ReactionButton icon="🎤" label={prepBusy === j.id ? "Preparing…" : prep[j.id] ? "Prep ready" : "Interview prep"} active={!!prep[j.id]}
                        onClick={() => loadPrep(j.id)} />
                      {j.board === "pasted" && (
                        <ReactionButton icon="🗑" label="Remove" active={false} danger onClick={() => removePasted(j.id)} />
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {rows.length > limit && (
          <button
            type="button"
            onClick={() => setLimit(limit + PAGE_SIZE)}
            className="mt-4 w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold hover:border-fg/40"
          >
            Show {Math.min(PAGE_SIZE, rows.length - limit)} more ({rows.length - limit} left)
          </button>
        )}
      </div>
    </div>
  );
}
