"use client";
import { useState } from "react";

type State = "idle" | "running" | "done" | "unconfigured" | "error";

export default function TelegramButton({ configured }: { configured: boolean }) {
  const [state, setState] = useState<State>(configured ? "idle" : "unconfigured");
  const [result, setResult] = useState<{ sent?: number; reason?: string } | null>(null);

  if (state === "unconfigured") {
    return (
      <span className="text-xs text-muted" title="Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env.local to enable">
        Telegram: not configured
      </span>
    );
  }

  async function send() {
    setState("running");
    try {
      const res = await fetch("/api/notify", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setResult(json);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const label: Record<State, string> = {
    idle: "Send digest",
    running: "Sending…",
    done: result?.sent ? `Sent ${result.sent} role${result.sent > 1 ? "s" : ""}` : (result?.reason ?? "Up to date"),
    unconfigured: "",
    error: "Error — retry",
  };

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === "running" || state === "done"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold transition-colors hover:border-fg/40 disabled:opacity-60"
      title="Send a Telegram digest of roles scoring 75+"
    >
      <span>✈</span> {label[state]}
    </button>
  );
}
