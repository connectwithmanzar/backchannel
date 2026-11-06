"use client";
import { useState } from "react";

type State = "idle" | "running" | "done" | "error";

export default function ScoreNowButton() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<{ scored?: number; ai_enabled?: boolean } | null>(null);

  async function run() {
    setState("running");
    try {
      const res = await fetch("/api/score-jobs", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unknown error");
      setResult(json);
      setState("done");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setState("error");
    }
  }

  const label: Record<State, string> = {
    idle: "Score all",
    running: "Scoring…",
    done: result?.scored ? `Scored ${result.scored}` : "Up to date",
    error: "Error — retry",
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === "running"}
      className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:border-fg/40 disabled:opacity-60"
    >
      {label[state]}
    </button>
  );
}
