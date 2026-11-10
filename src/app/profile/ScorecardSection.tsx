"use client";
import { useState } from "react";
import type { Profile } from "./ProfileClient";

const SEGMENTS = ["SMB", "Mid-market", "Enterprise"];
const MOTIONS = ["Outbound", "Inbound", "Full-cycle"];
const FLOOR_MARKETS: [string, string][] = [
  ["india", "India (on-site or hybrid)"],
  ["remote-in", "Remote from India"],
  ["emea", "Europe and Gulf (EMEA)"],
  ["us", "United States and Canada"],
  ["global", "Global or other"],
];
const MARKETS = ["India (onsite)", "India (hybrid)", "Remote India→US", "Remote India→EU", "UK", "Germany", "Netherlands", "France", "Ireland", "Singapore", "UAE"];
const TITLES = ["Senior SDR", "Founding BDR", "SDR", "BDR", "Account Executive (SMB)", "Account Executive (Mid-market)", "GTM Engineer", "Sales Manager", "Account Manager", "Partnerships Manager", "Sales Operations", "Customer Success Manager"];

export default function ScorecardSection({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (updates: Partial<Profile>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toolInput, setToolInput] = useState("");

  const p = profile;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", ...p }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  function addTool() {
    const t = toolInput.trim();
    if (!t) return;
    const tools = [...(p.tools ?? [])];
    if (!tools.includes(t)) onChange({ tools: [...tools, t] });
    setToolInput("");
  }

  function removeTool(tool: string) {
    onChange({ tools: (p.tools ?? []).filter((t) => t !== tool) });
  }

  function toggleList(field: "target_titles" | "markets", value: string) {
    const current = p[field] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ [field]: next });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* Name + current role */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sc-name" className="mb-1 block text-sm font-medium">Name</label>
          <input id="sc-name"
            className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={p.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="sc-role" className="mb-1 block text-sm font-medium">Current role</label>
          <input id="sc-role"
            className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={p.current_role ?? ""}
            onChange={(e) => onChange({ current_role: e.target.value })}
            placeholder="e.g. Senior SDR"
          />
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="sc-years" className="mb-1 block text-sm font-medium">Years in sales</label>
          <input id="sc-years"
            type="number"
            min={0}
            step={0.5}
            className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={p.years_in_sales ?? ""}
            onChange={(e) => onChange({ years_in_sales: e.target.valueAsNumber || undefined })}
            placeholder="e.g. 3"
          />
        </div>
        <div>
          <label htmlFor="sc-quota" className="mb-1 block text-sm font-medium">Quota attainment %</label>
          <input id="sc-quota"
            type="number"
            min={0}
            className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={p.quota_attainment_pct ?? ""}
            onChange={(e) => onChange({ quota_attainment_pct: e.target.valueAsNumber || undefined })}
            placeholder="e.g. 112"
          />
        </div>
        <div>
          <label htmlFor="sc-meetings" className="mb-1 block text-sm font-medium">Meetings/month</label>
          <input id="sc-meetings"
            type="number"
            min={0}
            className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={p.meetings_per_month ?? ""}
            onChange={(e) => onChange({ meetings_per_month: e.target.valueAsNumber || undefined })}
            placeholder="e.g. 20"
          />
        </div>
      </div>

      {/* Segment + Motion */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p id="grp-segment" className="mb-2 block text-sm font-medium">Segment</p>
          <div role="group" aria-labelledby="grp-segment" className="flex gap-2">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ segment: p.segment === s ? undefined : s })}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  p.segment === s
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-sunk text-muted hover:border-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p id="grp-motion" className="mb-2 block text-sm font-medium">Motion</p>
          <div role="group" aria-labelledby="grp-motion" className="flex gap-2">
            {MOTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ motion: p.motion === m ? undefined : m })}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  p.motion === m
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-sunk text-muted hover:border-accent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tools */}
      <div>
        <p id="grp-tools" className="mb-2 block text-sm font-medium">Tools you use</p>
        <div role="group" aria-labelledby="grp-tools" className="mb-2 flex flex-wrap gap-2">
          {(p.tools ?? []).map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full border border-line bg-sunk px-3 py-1 text-xs font-medium"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTool(t)}
                className="ml-1 text-muted hover:text-fg"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTool())}
            placeholder="Type a tool and press Enter (e.g. HubSpot)"
          />
          <button
            type="button"
            onClick={addTool}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Add
          </button>
        </div>
      </div>

      {/* Target titles */}
      <div>
        <p id="grp-roles" className="mb-2 block text-sm font-medium">Target roles</p>
        <div role="group" aria-labelledby="grp-roles" className="flex flex-wrap gap-2">
          {TITLES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleList("target_titles", t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                (p.target_titles ?? []).includes(t)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-sunk text-muted hover:border-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Markets */}
      <div>
        <p id="grp-markets" className="mb-2 block text-sm font-medium">Target markets</p>
        <div role="group" aria-labelledby="grp-markets" className="flex flex-wrap gap-2">
          {MARKETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleList("markets", m)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                (p.markets ?? []).includes(m)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-sunk text-muted hover:border-accent"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Minimum OTE */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          Minimum OTE (USD/year)
        </label>
        <input
          type="number"
          min={0}
          step={5000}
          className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
          value={p.min_ote_usd ?? ""}
          onChange={(e) => onChange({ min_ote_usd: e.target.valueAsNumber || undefined })}
          placeholder="e.g. 80000"
        />
        <p className="mt-1 text-xs text-muted">Roles below this are shown but ranked lower</p>
      </div>

      {/* Minimum OTE per market */}
      <div>
        <label className="mb-1 block text-sm font-medium">Different minimum for a market (optional, USD/year)</label>
        <p className="mb-2 text-xs text-muted">Pay differs a lot by country. Leave a box empty to use the minimum above.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FLOOR_MARKETS.map(([key, name]) => (
            <label key={key} className="grid gap-1 text-xs text-muted">
              {name}
              <input
                type="number"
                min={0}
                step={5000}
                className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                value={p.min_ote_by_market?.[key] ?? ""}
                onChange={(e) => {
                  const next = { ...(p.min_ote_by_market ?? {}) };
                  if (e.target.valueAsNumber > 0) next[key] = e.target.valueAsNumber;
                  else delete next[key];
                  onChange({ min_ote_by_market: next });
                }}
                placeholder="same as above"
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-accent px-6 py-3 font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save scorecard"}
      </button>
    </form>
  );
}
