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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        watching
          ? "bg-accent text-accent-ink hover:bg-accent/80"
          : "border border-line bg-surface text-muted hover:border-fg/40 hover:text-fg"
      }`}
    >
      {watching ? "★ Watching" : "☆ Watch"}
    </button>
  );
}
