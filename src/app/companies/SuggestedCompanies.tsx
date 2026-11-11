"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, btn, btnPrimary } from "@/components/ui";
import type { Suggestion } from "@/lib/company-list";

export default function SuggestedCompanies({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const shown = suggestions.filter((s) => !hidden.has(s.id));
  if (shown.length === 0) return null;

  async function add(s: Suggestion) {
    setBusy(s.id); setError("");
    try {
      // Add to Tier B. If the tier column is not there yet, the company is still added to your watch list.
      const res = await fetch("/api/company-tier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: s.id, tier: "B" }) });
      if (!res.ok) {
        const watch = await fetch("/api/watch-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: s.id, watching: true }) });
        if (!watch.ok) { setError("Couldn't add that company."); return; }
      }
      setHidden((h) => new Set(h).add(s.id));
      router.refresh();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(null); }
  }

  return (
    <Card className="mb-6 border-accent">
      <h2 className="text-lg font-semibold">Suggested for your list</h2>
      <p className="mt-1 text-sm text-muted">Companies you do not watch yet that opened the most new sales roles this week. You decide; nothing is added without your click.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm"><b>{s.name}</b> <span className="text-muted">{s.reason}</span></span>
            <span className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy === s.id} onClick={() => add(s)}>Add to Tier B</button>
              <button type="button" className={btn} onClick={() => setHidden((h) => new Set(h).add(s.id))}>Not now</button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-warn">{error}</p>}
    </Card>
  );
}
