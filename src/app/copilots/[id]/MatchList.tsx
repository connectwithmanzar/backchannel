"use client";
import { useState } from "react";
import { Card, Pill, btn } from "@/components/ui";

export type Match = { id: string; title: string; company: string; location: string; url: string; saved: boolean; likeKept: boolean };

type Reaction = "bookmarked" | "skipped";

export default function MatchList({ initial }: { initial: Match[] }) {
  const [matches, setMatches] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function react(match: Match, reaction: Reaction) {
    setBusyId(match.id);
    setError(null);
    try {
      const res = await fetch("/api/job-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: match.id, reaction }) });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Couldn't save that (error ${res.status}).`);
      } else if (reaction === "skipped") {
        setMatches((all) => all.filter((m) => m.id !== match.id));
      } else {
        setMatches((all) => all.map((m) => (m.id === match.id ? { ...m, saved: true } : m)));
      }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
    setBusyId(null);
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <ul className="space-y-3">
        {matches.map((m) => (
          <li key={m.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold">{m.title}</h2>
                  <p className="text-sm text-muted">{m.company}{m.location ? ` · ${m.location}` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.likeKept && <Pill tone="accent">Like jobs you kept</Pill>}
                    {m.saved && <Pill tone="good">Saved</Pill>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" className={btn}>Open job</a>}
                  {!m.saved && <button type="button" className={btn} disabled={busyId === m.id} onClick={() => react(m, "bookmarked")}>Save</button>}
                  <button type="button" className={btn} disabled={busyId === m.id} onClick={() => react(m, "skipped")}>Skip</button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
