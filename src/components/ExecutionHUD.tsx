"use client";
import { useState, useEffect } from "react";

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warn" | "error";
  message: string;
}

export default function ExecutionHUD() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "1", timestamp: "00:00:01", type: "info", message: "Backchannel Auto-Apply Engine initialized." },
    { id: "2", timestamp: "00:00:02", type: "success", message: "Local AI active: Qwen 2.5 (14B) on Ollama." },
    { id: "3", timestamp: "00:00:03", type: "success", message: "Direct ATS submitter ready (Greenhouse + Lever)." },
  ]);
  const [status, setStatus] = useState<"idle" | "running" | "ready">("ready");

  useEffect(() => {
    // Listen for custom execution events from auto-apply and AI
    const handleLog = (e: CustomEvent<{ message: string; type?: LogEntry["type"] }>) => {
      const now = new Date().toLocaleTimeString();
      setLogs((prev) => [
        ...prev.slice(-20),
        {
          id: Math.random().toString(36).substring(7),
          timestamp: now,
          type: e.detail.type || "info",
          message: e.detail.message,
        },
      ]);
      setStatus("running");
      setTimeout(() => setStatus("ready"), 2000);
    };

    window.addEventListener("bc:log" as unknown as keyof WindowEventMap, handleLog as EventListener);
    return () => window.removeEventListener("bc:log" as unknown as keyof WindowEventMap, handleLog as EventListener);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 font-sans">
      {/* Expanded Console Drawer */}
      {open && (
        <div className="w-[380px] max-w-[95vw] overflow-hidden rounded-2xl border border-line bg-surface/95 p-3 shadow-2xl backdrop-blur-md transition-all">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-fg">Live Execution HUD</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted hover:text-fg"
              title="Close Console"
            >
              ✕
            </button>
          </div>

          <div className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto font-mono text-[11px]">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-muted">{log.timestamp}</span>
                <span
                  className={
                    log.type === "success"
                      ? "text-emerald-500"
                      : log.type === "warn"
                      ? "text-amber-500"
                      : log.type === "error"
                      ? "text-rose-500"
                      : "text-fg"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persistent Floating HUD Pill */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full border border-line bg-surface/90 px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition-all hover:border-accent hover:shadow-xl active:scale-95"
      >
        <span className="relative flex h-2 w-2">
          {status === "running" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              status === "running" ? "bg-accent" : "bg-emerald-500"
            }`}
          ></span>
        </span>
        <span className="text-muted">HUD:</span>
        <span className="font-semibold text-fg">
          {status === "running" ? "Auto-applying..." : "Local AI Ready"}
        </span>
        <span className="rounded bg-line/60 px-1 py-0.5 font-mono text-[10px] text-muted">
          {open ? "ESC" : "LOGS"}
        </span>
      </button>
    </div>
  );
}

/** Helper to dispatch log events to HUD from anywhere */
export function hudLog(message: string, type: LogEntry["type"] = "info") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bc:log", { detail: { message, type } }));
  }
}
