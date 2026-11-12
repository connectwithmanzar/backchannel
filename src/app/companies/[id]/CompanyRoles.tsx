"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, btn, btnPrimary } from "@/components/ui";
import { sourceLabel } from "@/lib/role-filters";

export interface CompanyRole { id: string; title: string; location: string; url: string; postedAt: string | null; market: string; source: string | null; relevant: boolean }

const MARKET: Record<string, string> = { india: "India", "remote-in": "Remote (India)", emea: "EMEA", us: "US", global: "Global remote", other: "Other country" };
const posted = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default function CompanyRoles({ roles, companyName }: { roles: CompanyRole[]; companyName: string }) {
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const relevantCount = useMemo(() => roles.filter((r) => r.relevant).length, [roles]);
  const shown = relevantOnly ? roles.filter((r) => r.relevant) : roles;

  async function save(id: string) {
    setError("");
    const res = await fetch("/api/job-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: id, reaction: "bookmarked" }) });
    if (res.ok) setSaved((s) => new Set(s).add(id)); else setError("Couldn't save that job.");
  }

  const pill = "rounded-full px-4 py-2 text-sm font-semibold";
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Open roles at {companyName}</h2>
        <div className="flex gap-2" role="group" aria-label="Which roles to show">
          <button type="button" aria-pressed={relevantOnly} onClick={() => setRelevantOnly(true)} className={`${pill} ${relevantOnly ? "bg-accent text-accent-ink" : "border border-line bg-surface hover:border-fg/40"}`}>Relevant to me <span className="num opacity-70">{relevantCount}</span></button>
          <button type="button" aria-pressed={!relevantOnly} onClick={() => setRelevantOnly(false)} className={`${pill} ${!relevantOnly ? "bg-accent text-accent-ink" : "border border-line bg-surface hover:border-fg/40"}`}>All roles <span className="num opacity-70">{roles.length}</span></button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-warn">{error}</p>}
      {shown.length === 0 ? (
        <Card className="mt-3"><p className="text-sm text-muted">
          {roles.length === 0 ? `No open sales roles found at ${companyName} right now. New ones are collected every morning.` : `${roles.length} roles here, none relevant to you. Switch to All roles to see them.`}
        </p></Card>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1 basis-64">
                  <h3 className="text-[17px] font-semibold">{r.title}</h3>
                  <p className="text-sm text-muted">{[r.location || "Location not stated", MARKET[r.market] ?? r.market, posted(r.postedAt) && `posted ${posted(r.postedAt)}`, r.source?.startsWith("jobradar:") ? sourceLabel(r.source) : r.source === "pasted" ? "Saved by you" : "Company careers page"].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/roles/${r.id}`} className={btnPrimary}>See why it fits</Link>
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className={btn}>Open role ↗</a>}
                  <button type="button" className={btn} disabled={saved.has(r.id)} onClick={() => save(r.id)}>{saved.has(r.id) ? "Saved" : "Save"}</button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
