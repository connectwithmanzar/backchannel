"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, Pill, btn } from "@/components/ui";
import type { AppRow } from "@/app/autopilot/AutopilotClient";

const KANBAN_STAGES = [
  { id: "applied", label: "Applied", accent: "border-sky-500" },
  { id: "screening", label: "Screening", accent: "border-amber-500" },
  { id: "interview", label: "Interview", accent: "border-indigo-500" },
  { id: "final", label: "Final Round", accent: "border-purple-500" },
  { id: "offer", label: "Offer", accent: "border-emerald-500" },
] as const;

export default function ApplicationKanban({
  apps,
  busy,
  act,
}: {
  apps: AppRow[];
  busy: string | null;
  act: (k: string, b: object, ok: string, after?: () => void) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"kanban" | "table">("kanban");

  const stageColumns = KANBAN_STAGES.map((col) => {
    return {
      ...col,
      items: apps.filter((a) => (a.stage || "applied") === col.id),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">View Mode:</span>
          <button
            onClick={() => setActiveTab("kanban")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              activeTab === "kanban" ? "bg-accent text-white" : "border border-line text-muted hover:text-fg"
            }`}
          >
            Kanban Board
          </button>
          <button
            onClick={() => setActiveTab("table")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              activeTab === "table" ? "bg-accent text-white" : "border border-line text-muted hover:text-fg"
            }`}
          >
            Classic Table
          </button>
        </div>
        <span className="text-xs text-muted">{apps.length} Total Applications Active</span>
      </div>

      {activeTab === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {stageColumns.map((col) => (
            <div key={col.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface/50 p-3">
              <div className={`flex items-center justify-between border-b-2 ${col.accent} pb-2`}>
                <span className="text-sm font-bold text-fg">{col.label}</span>
                <span className="rounded-full bg-sunk px-2 py-0.5 font-mono text-xs text-muted">
                  {col.items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {col.items.map((a) => (
                  <div
                    key={a.id}
                    className="group flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm transition-all hover:border-accent hover:shadow-md"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-fg line-clamp-1">{a.jobs?.title}</div>
                      <div className="text-xs text-muted">{a.jobs?.companies?.name || "Company"}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {a.receipt && (
                        <span className="rounded bg-good-soft px-1.5 py-0.5 text-good line-clamp-1" title={a.receipt}>
                          ✓ {a.receipt.includes("Greenhouse") ? "Greenhouse" : a.receipt.includes("Lever") ? "Lever" : "Submitted"}
                        </span>
                      )}
                      <a
                        href={`/api/applications/${a.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-line px-1.5 py-0.5 text-muted hover:border-accent hover:text-fg"
                        title="Download Tailored ATS PDF"
                      >
                        PDF 📄
                      </a>
                    </div>

                    {/* Stage Mover Selector */}
                    <div className="mt-1 flex items-center justify-between border-t border-line/50 pt-2 text-xs">
                      <select
                        aria-label="Advance Stage"
                        className="rounded border border-line bg-sunk px-1.5 py-1 text-[11px] text-fg"
                        value={a.stage ?? "applied"}
                        disabled={!!busy}
                        onChange={(e) => act(a.id, { action: "stage", id: a.id, stage: e.target.value }, `Moved to ${e.target.value}`)}
                      >
                        {KANBAN_STAGES.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                      <a
                        href={a.jobs?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted hover:text-accent"
                        title="View original posting"
                      >
                        ↗
                      </a>
                    </div>
                  </div>
                ))}

                {col.items.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line/60 text-center text-xs text-muted">
                    No applications
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Classic Table Fallback */
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Applied</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Resume PDF</th>
                <th className="px-3 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <b>{a.jobs?.title}</b>
                    <div className="text-muted">{a.jobs?.companies?.name}</div>
                  </td>
                  <td className="px-3 py-2 num whitespace-nowrap text-muted">
                    {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label="Stage"
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                      value={a.stage ?? "applied"}
                      disabled={!!busy}
                      onChange={(e) => act(a.id, { action: "stage", id: a.id, stage: e.target.value }, "Stage updated.")}
                    >
                      {KANBAN_STAGES.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={`/api/applications/${a.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline hover:opacity-80"
                    >
                      Download PDF 📄
                    </a>
                  </td>
                  <td className="px-3 py-2 text-muted">{a.receipt || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
