"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ScoredJob } from "@/lib/score";
import Link from "next/link";
import FitRing from "@/components/FitRing";
import { tierRank, type Tier } from "@/lib/company-rating";
import { formatPay, formatUsdThreshold, type PayDisplay } from "@/lib/currency";
import { countryOf, matchesLocation, matchesQuery, openToIndia, postedWithin, seniorityOf, sourceLabel } from "@/lib/role-filters";

const MARKETS: Record<string, string> = {
  india: "India",
  "remote-in": "Remote (India)",
  emea: "EMEA",
  us: "US",
  global: "Global / remote",
};
const PAGE_SIZE = 40;
const FAMILIES = ["SDR/BDR", "GTM Engineer", "Account Executive", "Sales leadership", "Account management", "Partnerships", "Sales ops & CS"];

export interface JobReaction {
  job_id: string;
  reaction: "bookmarked" | "skipped" | "applied" | null;
  score?: number;
  explanation?: string;
  model?: string;
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
  defaultMarkets = [],
  initialQuery = "",
  initialSaved = false,
  priorityIds = [],
  tierById = {},
  suggestedIds = [],
}: {
  suggestedIds?: string[];
  tierById?: Record<string, Tier>;
  priorityIds?: string[];
  initialSaved?: boolean;
  initialQuery?: string;
  jobs: ScoredJob[];
  reactions?: Record<string, JobReaction>;
  defaultMarkets?: string[];
}) {
  const [markets, setMarkets] = useState<Set<string>>(new Set(defaultMarkets));
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(initialQuery);
  const [locationQ, setLocationQ] = useState("");
  const [posted, setPosted] = useState(0);
  const [workType, setWorkType] = useState("any");
  const [seniority, setSeniority] = useState("any");
  const [visaOnly, setVisaOnly] = useState(false);
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [indiaOnly, setIndiaOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(initialSaved);
  const prioritySet = useMemo(() => new Set(priorityIds), [priorityIds]);
  const suggestedSet = useMemo(() => new Set(suggestedIds), [suggestedIds]);
  // Roles at the companies you watch come first; a search or the saved view starts on "All".
  const [view, setView] = useState<"priority" | "all">(priorityIds.length > 0 && !initialSaved && !initialQuery ? "priority" : "all");
  const [display, setDisplay] = useState<PayDisplay>("INR");
  const [payOnly, setPayOnly] = useState(false);
  const [minUsd, setMinUsd] = useState(0);
  const [sort, setSort] = useState<"fit" | "pay" | "new">("fit");
  const [open, setOpen] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [reactions, setReactions] = useState<Record<string, JobReaction>>(initialReactions);
  useEffect(() => {
    try { const v = localStorage.getItem("bc-pay-display"); if (v === "INR" || v === "USD" || v === "original") setDisplay(v); } catch { /* storage can be blocked */ }
  }, []);
  function changeDisplay(v: PayDisplay) {
    setDisplay(v);
    try { localStorage.setItem("bc-pay-display", v); } catch { /* ignore */ }
  }
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

  const countryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) m.set(countryOf(j.location), (m.get(countryOf(j.location)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [jobs]);
  const isMine = useCallback((j: ScoredJob) => j.board === "pasted" || reactions[j.id]?.reaction === "bookmarked", [reactions]);
  const savedCount = jobs.filter(isMine).length;
  const rows = useMemo(() => {
    const r = jobs.filter((j) => {
      const rxn = reactions[j.id]?.reaction;
      if (!showSkipped && rxn === "skipped") return false;
      return (
        // Jobs you saved or added yourself are never hidden by the market or role-type filters.
        (isMine(j) || ((!markets.size || markets.has(j.market)) && (!families.size || families.has(j.roleFamily)))) &&
        (!savedOnly || isMine(j)) &&
        (view === "all" || prioritySet.has(j.id) || isMine(j)) &&
        (workType === "any" || j.remoteType === workType) &&
        (seniority === "any" || seniorityOf(j.title) === seniority) &&
        (!visaOnly || j.visaSponsorship === "yes") &&
        (!countries.size || countries.has(countryOf(j.location))) &&
        (!indiaOnly || openToIndia(j.location, j.remoteType)) &&
        postedWithin(j.postedAt, posted) &&
        matchesQuery(j, query) &&
        matchesLocation(j, locationQ) &&
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
        const at = tierRank(tierById[a.id]);
        const bt = tierRank(tierById[b.id]);
        if (bt !== at) return bt - at;
        const ap = prioritySet.has(a.id) ? 1 : 0;
        const bp = prioritySet.has(b.id) ? 1 : 0;
        if (bp !== ap) return bp - ap;
        return b.score - a.score;
      });
    return r;
  }, [jobs, prioritySet, tierById, view, isMine, markets, families, countries, indiaOnly, savedOnly, query, locationQ, posted, workType, seniority, visaOnly, payOnly, minUsd, sort, showSkipped, reactions]);

  const skippedCount = Object.values(reactions).filter((r) => r.reaction === "skipped").length;

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
      {/* Filters */}
      <aside className="flex min-w-0 flex-col gap-5" aria-label="Filters">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Search roles</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, company, skill"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Location</span>
          <input type="text" value={locationQ} onChange={(e) => setLocationQ(e.target.value)} placeholder="e.g. Bengaluru, Dubai"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} className="accent-accent" />
          Saved by you ({savedCount})
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Country</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={indiaOnly} onChange={(e) => setIndiaOnly(e.target.checked)} className="accent-accent" />
            Open to India (in India, or remote with no country limit)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {countryCounts.map(([c, n]) => (
              <Chip key={c} on={countries.has(c)} onClick={() => toggle(countries, setCountries, c)}>{c} <span className="num opacity-60">{n}</span></Chip>
            ))}
          </div>
        </div>
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
            Min pay ({display === "USD" ? "USD" : "per year"}) <span className="num">{formatUsdThreshold(minUsd, display)}</span>
          </span>
          <input type="range" min={0} max={200000} step={10000} value={minUsd} onChange={(e) => setMinUsd(+e.target.value)} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Work type</span>
          <select value={workType} onChange={(e) => setWorkType(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2">
            <option value="any">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Level</span>
          <select value={seniority} onChange={(e) => setSeniority(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2">
            <option value="any">Any</option><option value="entry">Entry</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="lead">Lead or manager</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Posted</span>
          <select value={posted} onChange={(e) => setPosted(+e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2">
            <option value={0}>Any time</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visaOnly} onChange={(e) => setVisaOnly(e.target.checked)} className="accent-accent" />
          Visa sponsorship offered
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
        {priorityIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Which roles to show">
            <button type="button" aria-pressed={view === "priority"} onClick={() => setView("priority")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${view === "priority" ? "bg-fg text-bg" : "border border-line bg-surface hover:border-fg/40"}`}>
              Priority <span className="num opacity-70">{priorityIds.length}</span>
            </button>
            <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${view === "all" ? "bg-fg text-bg" : "border border-line bg-surface hover:border-fg/40"}`}>
              All matches <span className="num opacity-70">{jobs.length}</span>
            </button>
            <span className="text-sm text-muted">{view === "priority" ? "Roles at the companies you watch." : "Everything, with your watched companies first."}</span>
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span className="num">{rows.length} of {jobs.length} roles</span>
          <label>Pay in{" "}
            <select value={display} onChange={(e) => changeDisplay(e.target.value as PayDisplay)} className="rounded-lg border border-line bg-surface px-2 py-1">
              <option value="INR">₹ INR</option><option value="USD">$ USD</option><option value="original">As posted</option>
            </select>
          </label>
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
                  isOpen ? "border-accent" : "border-line hover:border-fg/30"
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
                    <div className="line-clamp-1 text-sm text-muted">{j.company} · {j.location}</div>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <FitRing score={j.score} size={56} />
                    <span className={j.payMax ? "text-sm font-semibold num" : "text-xs text-muted"}>
                      {j.payMax ? formatPay(j.payMin, j.payMax, j.currency, display) : "Pay not published"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                    {openToIndia(j.location, j.remoteType) && (
                      <span className="rounded-md bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">Open to India</span>
                    )}
                    {tierById[j.id] && (
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tierById[j.id] === "D" ? "bg-warn-soft text-warn" : "bg-fg text-bg"}`}>Tier {tierById[j.id]}{suggestedSet.has(j.id) ? " (suggested)" : ""}</span>
                    )}
                    <span className="rounded-md bg-signal-soft px-2 py-0.5 text-xs font-semibold text-signal">
                      {sourceLabel(j.board)}
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
                  </div>
                </button>

                {prioritySet.has(j.id) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-bg/60 px-4 py-2.5 text-sm">
                    <span className="font-semibold">Referral first</span>
                    <span className="text-muted">A person inside beats an application in the pile.</span>
                    <a href={`/referrals?company=${encodeURIComponent(j.company)}&domain=${encodeURIComponent(j.companyDomain ?? "")}&job=${encodeURIComponent(j.id)}`}
                      className="font-semibold text-accent underline-offset-2 hover:underline">Ask for a referral →</a>
                  </div>
                )}

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
                      <Link href={`/roles/${j.id}`} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
                        See why it fits
                      </Link>
                      <a href={j.url} target="_blank" rel="noopener noreferrer"
                        className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-fg/40">
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
                      <a href={`/referrals?company=${encodeURIComponent(j.company)}&domain=${encodeURIComponent(j.companyDomain ?? "")}&job=${encodeURIComponent(j.id)}`}
                        className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-fg/30">
                        🤝 Ask for a referral
                      </a>
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
