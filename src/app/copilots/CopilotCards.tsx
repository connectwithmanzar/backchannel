"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Pill, btn } from "@/components/ui";
import { describeWhere, SENIORITY_LABELS, type Copilot } from "@/lib/copilots";

export type CopilotCard = Copilot & { newThisWeek: number };

async function readJson(res: Response): Promise<{ error?: string }> {
  return res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
}

export default function CopilotCards({ initial }: { initial: CopilotCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(card: CopilotCard) {
    setBusyId(card.id);
    setError(null);
    const next = !card.isOn;
    try {
      const d = await readJson(await fetch("/api/copilots", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: card.id, is_on: next }) }));
      if (d.error) setError(d.error);
      else setCards((all) => all.map((c) => (c.id === card.id ? { ...c, isOn: next } : c)));
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
    setBusyId(null);
  }

  async function remove(card: CopilotCard) {
    if (!window.confirm(`Delete the Copilot "${card.name}"?`)) return;
    setBusyId(card.id);
    setError(null);
    try {
      const d = await readJson(await fetch(`/api/copilots?id=${encodeURIComponent(card.id)}`, { method: "DELETE" }));
      if (d.error) setError(d.error);
      else {
        setCards((all) => all.filter((c) => c.id !== card.id));
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
    setBusyId(null);
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 break-words text-base font-bold">{c.name}</h2>
              <button
                type="button"
                role="switch"
                aria-checked={c.isOn}
                aria-label={`${c.name} is ${c.isOn ? "on" : "off"}`}
                disabled={busyId === c.id}
                onClick={() => toggle(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${c.isOn ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-muted"} disabled:opacity-60`}
              >
                {c.isOn ? "On" : "Off"}
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">{c.titles.join(", ")}</p>
            <p className="mt-1 text-sm">{describeWhere(c)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.seniority.length === 0 ? <Pill>Any level</Pill> : c.seniority.map((s) => <Pill key={s}>{SENIORITY_LABELS[s]}</Pill>)}
              {c.newThisWeek > 0 && <Pill tone="good">{c.newThisWeek} new this week</Pill>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/copilots/${c.id}`} className={btn}>See matches</Link>
              <Link href={`/copilots/${c.id}/edit`} className={btn}>Edit</Link>
              <button type="button" className={btn} disabled={busyId === c.id} onClick={() => remove(c)}>Delete</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
