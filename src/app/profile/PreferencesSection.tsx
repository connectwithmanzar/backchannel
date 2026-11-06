"use client";
import { useState } from "react";
import type { Preferences } from "./ProfileClient";

const CRITERIA = [
  "High salary",
  "Great culture",
  "Top-tier perks",
  "Work-life balance",
  "Equity / income upside",
  "Brand & prestige",
  "Learning & growth",
  "Remote flexibility",
  "Job security",
  "Mission & impact",
];

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Germany",
  "Netherlands",
  "France",
  "Ireland",
  "Singapore",
  "UAE",
  "Canada",
  "Australia",
];

export default function PreferencesSection({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: (updates: Partial<Preferences>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dealbreaker, setDealbreaker] = useState("");

  function toggle(field: "great_company_criteria" | "countries", value: string) {
    const current = prefs[field] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ [field]: next });
  }

  function addDealbreaker() {
    const d = dealbreaker.trim();
    if (!d) return;
    const current = prefs.dealbreakers ?? [];
    if (!current.includes(d)) onChange({ dealbreakers: [...current, d] });
    setDealbreaker("");
  }

  function removeDealbreaker(d: string) {
    onChange({ dealbreakers: (prefs.dealbreakers ?? []).filter((x) => x !== d) });
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "preferences", ...prefs }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Great company criteria */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          What makes a company great for you?
        </label>
        <p className="mb-3 text-xs text-muted">
          Used to curate and rank companies on the Great companies page.
        </p>
        <div className="flex flex-wrap gap-2">
          {CRITERIA.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggle("great_company_criteria", c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                (prefs.great_company_criteria ?? []).includes(c)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-sunk text-muted hover:border-accent"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Countries open to */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Countries you&apos;d work in</label>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggle("countries", c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                (prefs.countries ?? []).includes(c)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-sunk text-muted hover:border-accent"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Dealbreakers */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Dealbreakers</label>
        <p className="mb-3 text-xs text-muted">
          Roles matching these are hidden or ranked last.
        </p>
        <div className="mb-2 flex flex-wrap gap-2">
          {(prefs.dealbreakers ?? []).map((d) => (
            <span
              key={d}
              className="flex items-center gap-1 rounded-full border border-warn bg-warn-soft px-3 py-1 text-xs font-medium text-warn"
            >
              {d}
              <button type="button" onClick={() => removeDealbreaker(d)} className="ml-1">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={dealbreaker}
            onChange={(e) => setDealbreaker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDealbreaker())}
            placeholder="e.g. No equity, Enterprise only, Travel required"
          />
          <button
            type="button"
            onClick={addDealbreaker}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Add
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-xl bg-accent px-6 py-3 font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save preferences"}
      </button>
    </div>
  );
}
