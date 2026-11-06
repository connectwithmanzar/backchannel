"use client";
import { useState } from "react";

type State = "idle" | "running" | "done" | "error";

export default function CurateButton() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<{ added?: number } | null>(null);

  async function run() {
    setState("running");
    try {
      const res = await fetch("/api/curate-companies", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setResult(json);
      setState("done");
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  const labels: Record<State, string> = {
    idle: "Find more companies with AI",
    running: "Curating…",
    done: `Added ${result?.added ?? 0} companies`,
    error: "Error — retry",
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === "running"}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      ✨ {labels[state]}
    </button>
  );
}
