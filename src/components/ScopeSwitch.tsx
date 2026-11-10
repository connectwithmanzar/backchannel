"use client";
import { useState, type ReactNode } from "react";

/** One switch for every search: look through what Backchannel already holds, or search the open web. */
export default function ScopeSwitch({ mine, web, mineLabel, webLabel = "Open web" }: { mine: ReactNode; web: ReactNode; mineLabel: string; webLabel?: string }) {
  const [scope, setScope] = useState<"mine" | "web">("mine");
  const tab = (id: "mine" | "web", text: string) => (
    <button type="button" role="tab" aria-selected={scope === id} onClick={() => setScope(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${scope === id ? "bg-accent text-accent-ink" : "text-muted hover:text-fg"}`}>{text}</button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Where to search" className="inline-flex w-fit gap-1 rounded-full border border-line bg-surface p-1">
        {tab("mine", mineLabel)}{tab("web", webLabel)}
      </div>
      {scope === "mine" ? mine : web}
    </div>
  );
}
