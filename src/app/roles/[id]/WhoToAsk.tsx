"use client";
import { useState } from "react";
import Link from "next/link";
import { btn } from "@/components/ui";

type Person = { full_name: string; position: string | null; linkedin_url: string | null };
type SearchLink = { label: string; url: string };

/** Your LinkedIn connections at this company (best first) and one-click LinkedIn searches. Asking is always done by you. */
export default function WhoToAsk({ company, roleTitle, jobId, people, links }: { company: string; roleTitle: string; jobId: string; people: Person[]; links: SearchLink[] }) {
  const [added, setAdded] = useState<Record<string, string>>({});

  async function ask(p: Person) {
    setAdded((a) => ({ ...a, [p.full_name]: "Adding…" }));
    const res = await fetch("/api/referrals", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", company_name: company, referrer_name: p.full_name, role_title: roleTitle, job_id: jobId, referrer_relation: p.position ? `LinkedIn connection, ${p.position}` : "LinkedIn connection" }) });
    const d = await res.json().catch(() => ({}));
    setAdded((a) => ({ ...a, [p.full_name]: res.ok ? "Added to Referrals" : d.error ?? "Couldn't add" }));
  }

  return (
    <div className="flex flex-col gap-3">
      {people.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {people.map((p) => (
            <li key={p.full_name} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                {p.linkedin_url ? <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent">{p.full_name}</a> : <span className="font-semibold">{p.full_name}</span>}
                {p.position && <span className="block text-muted">{p.position}</span>}
              </span>
              {added[p.full_name] ? <span className="text-xs text-muted">{added[p.full_name]}</span>
                : <button type="button" className={`${btn} px-3 py-1.5 text-xs`} onClick={() => ask(p)}>Ask for referral</button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">None of your LinkedIn connections work at {company}. Try the searches below.</p>}
      {links.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent">{l.label} ↗</a></li>)}
        </ul>
      )}
      {Object.values(added).some((v) => v === "Added to Referrals") && <Link href="/referrals" className="text-sm font-semibold text-accent">Open Referrals to draft the ask →</Link>}
    </div>
  );
}
