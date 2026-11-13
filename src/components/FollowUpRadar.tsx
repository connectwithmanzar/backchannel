"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, Pill, btn, btnPrimary } from "@/components/ui";
import { copyText } from "@/lib/api";

export interface StaleApplication {
  id: string;
  company: string;
  roleTitle: string;
  submittedAt: string;
  stage: string;
}

export default function FollowUpRadar({
  staleApps,
}: {
  staleApps: StaleApplication[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [followedUpIds, setFollowedUpIds] = useState<Set<string>>(new Set());

  if (!staleApps || staleApps.length === 0) return null;

  const pending = staleApps.filter((a) => !followedUpIds.has(a.id));
  if (pending.length === 0) return null;

  function calculateDays(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  function generateBumpNote(app: StaleApplication) {
    return `Hi team,\n\nFollowing up briefly on my application for the ${app.roleTitle} role submitted a few days ago. In the interim, I mapped out a high-level outbound acquisition framework for ${app.company}—would be glad to share it if helpful.\n\nBest,\nManzar`;
  }

  async function handleCopy(text: string, id: string) {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function markFollowedUp(id: string) {
    setFollowedUpIds((prev) => new Set([...prev, id]));
    if (activeId === id) setActiveId(null);
  }

  return (
    <Card className="flex flex-col gap-3 border-signal/40 bg-signal-soft/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal text-white text-xs font-bold">
            !
          </span>
          <h2 className="text-base font-bold text-fg">
            Follow-Up Radar: {pending.length} Stale Application{pending.length === 1 ? "" : "s"}
          </h2>
          <Pill tone="signal">Action Recommended</Pill>
        </div>
        <span className="text-xs text-muted">
          Applications with no reply after 4+ days benefit from a polite 2-line bump.
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {pending.slice(0, 5).map((app) => {
          const days = calculateDays(app.submittedAt);
          const isOpen = activeId === app.id;
          const note = generateBumpNote(app);

          return (
            <li key={app.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <b className="text-sm text-fg">{app.company}</b>
                  <span className="text-xs text-muted"> · {app.roleTitle}</span>
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="text-signal font-semibold">Submitted {days} days ago</span>
                    <span>·</span>
                    <span className="capitalize text-muted">Stage: {app.stage}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={isOpen ? btn : btnPrimary + " text-xs py-1 px-3"}
                    onClick={() => setActiveId(isOpen ? null : app.id)}
                  >
                    {isOpen ? "Hide Draft" : "⚡ Generate Follow-Up Note"}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted hover:text-fg"
                    onClick={() => markFollowedUp(app.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm">
                  <div className="flex items-center justify-between pb-1.5 border-b border-line">
                    <span className="text-xs font-bold uppercase text-muted">2-Line Follow-Up Bump</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-accent hover:underline"
                        onClick={() => handleCopy(note, app.id)}
                      >
                        {copied ? "Copied to clipboard ✓" : "Copy note"}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-good hover:underline"
                        onClick={() => markFollowedUp(app.id)}
                      >
                        Mark Followed Up ✓
                      </button>
                    </div>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg">
                    {note}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
