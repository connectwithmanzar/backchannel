"use client";
import { useState } from "react";

/** Adds a role to the Target list. `variant` picks the look: a round icon for Swipe, a text pill elsewhere. */
export default function TargetButton({ jobId, source, variant = "pill", disabled = false }: { jobId: string; source: "swipe" | "job" | "company"; variant?: "round" | "pill"; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function add() {
    setState("busy"); setMessage("");
    try {
      const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", job_id: jobId, source }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setState("done"); setMessage(d.existed ? "Already on your Target list" : "Added to your Target list"); }
      else { setState("error"); setMessage(String(d.error ?? "Couldn't add it.")); }
    } catch { setState("error"); setMessage("Couldn't reach the server."); }
  }

  const star = <svg width="22" height="22" viewBox="0 0 24 24" fill={state === "done" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" /></svg>;

  if (variant === "round") {
    return (
      <span className="relative">
        <button type="button" onClick={add} disabled={disabled || state === "busy" || state === "done"} aria-label={state === "done" ? "On your Target list" : "Add to Target list"} title="Add to Target list: roles you'll put a plan behind"
          className={`flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface shadow-sm hover:bg-sunk disabled:opacity-60 ${state === "done" ? "text-accent" : ""}`}>{star}</button>
        {message && <span role={state === "error" ? "alert" : "status"} className={`absolute left-1/2 top-full mt-1 w-44 -translate-x-1/2 text-center text-xs ${state === "error" ? "text-warn" : "text-muted"}`}>{message}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={add} disabled={disabled || state === "busy" || state === "done"} className={`rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-sunk disabled:opacity-60 ${state === "done" ? "text-accent" : ""}`}>
        {state === "done" ? "★ On Target list" : state === "busy" ? "Adding…" : "☆ Add to Target list"}
      </button>
      {state === "error" && <span role="alert" className="mt-1 text-xs text-warn">{message}</span>}
    </span>
  );
}
