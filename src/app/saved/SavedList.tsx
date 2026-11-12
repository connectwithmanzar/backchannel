"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, btn } from "@/components/ui";

export interface SavedJob { id: string; title: string; company: string; location: string; url: string; savedAt: string | null; score: number | null }

const savedOn = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function SavedList({ initial }: { initial: SavedJob[] }) {
  const [jobs, setJobs] = useState(initial);
  const [error, setError] = useState("");

  async function remove(id: string) {
    setError("");
    const res = await fetch(`/api/jobs/paste?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setJobs((j) => j.filter((x) => x.id !== id));
    else setError("Couldn't remove that job.");
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">Your saved jobs <span className="num text-muted">({jobs.length})</span></h2>
      {error && <p role="alert" className="mb-2 text-sm text-warn">{error}</p>}
      {jobs.length === 0 ? (
        <Card><p className="text-sm text-muted">Nothing saved yet. Paste a job link above and press Fetch, then Save job.</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Card className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1 basis-64">
                  <h3 className="text-[17px] font-semibold">{j.title}</h3>
                  <p className="text-sm text-muted">{j.company}{j.location ? ` · ${j.location}` : ""}{j.savedAt ? ` · saved ${savedOn(j.savedAt)}` : ""}</p>
                </div>
                {j.score != null && <span className="num rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent" title="How well it fits you">{j.score}% fit</span>}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/roles/${j.id}`} className={btn}>Details</Link>
                  {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" className={btn}>Open ↗</a>}
                  <button type="button" className={btn} onClick={() => remove(j.id)}>Remove</button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
