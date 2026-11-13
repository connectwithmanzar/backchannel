"use client";
import { useState } from "react";
import { Card, Pill, btn, btnPrimary } from "@/components/ui";
import { copyText } from "@/lib/api";
import type { StructuredBattlecard } from "@/app/api/prep/route";

export default function RoleBattlecard({
  jobId,
  company,
  roleTitle,
}: {
  jobId: string;
  company: string;
  roleTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [battlecard, setBattlecard] = useState<StructuredBattlecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"battlecard" | "plan" | "dm">("battlecard");

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, refresh }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Could not generate battlecard.");
      } else if (data.battlecard) {
        setBattlecard(data.battlecard);
      }
    } catch {
      setError("Failed to connect to prep engine.");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    if (!open && !battlecard) {
      load();
    }
    setOpen(!open);
  }

  async function handleCopy(key: string, text: string) {
    if (await copyText(text)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  return (
    <Card className="flex flex-col gap-3 border-accent/30 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-fg">🎯 Role Interview Battlecard &amp; 30-60-90 Day Plan</h2>
            <Pill tone="good">Competitive Edge</Pill>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Company intel, interview question &amp; story matcher, killer questions to ask, and 30-60-90 day blueprint.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {open && battlecard && (
            <button
              type="button"
              className={btn + " text-xs py-1 px-3"}
              disabled={loading}
              onClick={() => load(true)}
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          )}
          <button
            type="button"
            className={open ? btn : btnPrimary}
            onClick={handleToggle}
          >
            {open ? "Close Battlecard" : "Open Battlecard ↗"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 border-t border-line pt-3">
          {loading && !battlecard && (
            <div className="py-6 text-center text-sm text-muted">
              Analyzing job description &amp; synthesizing candidate battlecard with Story Bank…
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-warn-soft p-3 text-sm text-warn">
              {error}
            </div>
          )}

          {battlecard && (
            <div className="flex flex-col gap-4">
              {/* Tab Navigation */}
              <div className="flex flex-wrap gap-2 border-b border-line pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("battlecard")}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold ${
                    activeTab === "battlecard"
                      ? "bg-accent text-accent-ink"
                      : "bg-sunk text-muted hover:text-fg"
                  }`}
                >
                  🎯 Interview Questions &amp; Story Matcher
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("plan")}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold ${
                    activeTab === "plan"
                      ? "bg-accent text-accent-ink"
                      : "bg-sunk text-muted hover:text-fg"
                  }`}
                >
                  🚀 30-60-90 Day Plan
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("dm")}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold ${
                    activeTab === "dm"
                      ? "bg-accent text-accent-ink"
                      : "bg-sunk text-muted hover:text-fg"
                  }`}
                >
                  💬 50-Word LinkedIn DM
                </button>
              </div>

              {/* Tab 1: Battlecard */}
              {activeTab === "battlecard" && (
                <div className="flex flex-col gap-4">
                  {/* Intel */}
                  <div className="rounded-xl border border-line bg-sunk/40 p-3.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Company Intel &amp; Commercial Hurdle</h3>
                    <p className="mt-1 text-sm font-medium text-fg">{battlecard.intel.whatTheyDo}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                      <div><b className="text-fg">Target Buyers:</b> {battlecard.intel.targetBuyers}</div>
                      <div><b className="text-fg">Why they are hiring:</b> {battlecard.intel.whyHiring}</div>
                    </div>
                  </div>

                  {/* Matched Questions */}
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-fg">Likely Interview Questions &amp; Recommended Story</h3>
                    <ul className="flex flex-col gap-2.5">
                      {battlecard.matchedQuestions.map((q, idx) => (
                        <li key={idx} className="rounded-xl border border-line bg-surface p-3 text-sm">
                          <div className="font-semibold text-fg">“{q.question}”</div>
                          <div className="mt-1 text-xs text-accent font-medium">
                            ★ Tell Story: <span className="underline">{q.recommendedStory}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted leading-relaxed">
                            {q.keyTalkingPoint}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Killer questions to ask */}
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-fg">3 High-Signal Questions to Ask the Interviewer</h3>
                    <ul className="flex flex-col gap-2">
                      {battlecard.killerQuestions.map((kq, idx) => (
                        <li key={idx} className="flex items-start gap-2 rounded-lg bg-sunk/50 p-2.5 text-xs text-fg">
                          <span className="font-bold text-accent">Q{idx + 1}:</span>
                          <span>{kq}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tab 2: 30-60-90 Day Plan */}
              {activeTab === "plan" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">A tactical blueprint you can present in final rounds or share with the hiring manager.</span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent hover:underline"
                      onClick={() => handleCopy("plan", `30-60-90 Day Plan for ${roleTitle} at ${company}\n\nDays 1-30: ${battlecard.plan30_60_90.days30}\n\nDays 31-60: ${battlecard.plan30_60_90.days60}\n\nDays 61-90: ${battlecard.plan30_60_90.days90}`)}
                    >
                      {copiedKey === "plan" ? "Copied ✓" : "Copy full plan"}
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
                      <div className="font-bold text-accent">Days 1–30</div>
                      <div className="text-xs font-medium text-muted uppercase">Ramp &amp; Discovery</div>
                      <p className="mt-1 text-xs text-fg leading-relaxed">{battlecard.plan30_60_90.days30}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
                      <div className="font-bold text-accent">Days 31–60</div>
                      <div className="text-xs font-medium text-muted uppercase">First Pipeline &amp; Pilots</div>
                      <p className="mt-1 text-xs text-fg leading-relaxed">{battlecard.plan30_60_90.days60}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
                      <div className="font-bold text-accent">Days 61–90</div>
                      <div className="text-xs font-medium text-muted uppercase">Pacing &amp; Scale</div>
                      <p className="mt-1 text-xs text-fg leading-relaxed">{battlecard.plan30_60_90.days90}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: 50-Word DM */}
              {activeTab === "dm" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Send this directly on LinkedIn to the hiring manager right after applying.</span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent hover:underline"
                      onClick={() => handleCopy("dm", battlecard.executivePitchDm)}
                    >
                      {copiedKey === "dm" ? "Copied ✓" : "Copy note"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-line bg-surface p-3.5 text-sm font-medium leading-relaxed text-fg">
                    {battlecard.executivePitchDm}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
