"use client";
import { useState, useTransition } from "react";

export default function WatchButton({
  companyId,
  initialWatching,
}: {
  companyId: string;
  initialWatching: boolean;
}) {
  const [watching, setWatching] = useState(initialWatching);
  const [, startTransition] = useTransition();

  async function toggle() {
    const next = !watching;
    startTransition(() => setWatching(next));
    await fetch("/api/watch-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId, watching: next }),
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={watching ? "Stop watching" : "Watch this company"}
      aria-pressed={watching}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${
        watching
          ? "border-accent bg-accent-soft text-accent hover:bg-accent-soft/70"
          : "border-line bg-surface text-muted hover:border-fg/40 hover:text-fg"
      }`}
    >
      {watching ? "★ Watching" : "☆ Watch"}
    </button>
  );
}
