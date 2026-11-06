"use client";
import { useState } from "react";

export default function RunNowButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState("");

  async function run() {
    setState("running");
    setResult("");
    try {
      const res = await fetch("/api/collect-jobs", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setState("done");
        const companies = json.companies_checked ?? 0;
        const upserted = json.total_upserted ?? 0;
        setResult(`Done — ${upserted} roles upserted across ${companies} companies.`);
        setTimeout(() => window.location.reload(), 1800);
      } else {
        setState("error");
        setResult(json.error ?? "Collection failed.");
      }
    } catch {
      setState("error");
      setResult("Network error — check the browser console.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {state === "running" ? "Collecting…" : "Run now"}
      </button>
      {result && (
        <span className={`text-sm ${state === "error" ? "text-warn" : "text-muted"}`}>
          {result}
        </span>
      )}
    </div>
  );
}
