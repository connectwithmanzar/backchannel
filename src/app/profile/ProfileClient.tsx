"use client";
import { useEffect, useState } from "react";
import ScorecardSection from "./ScorecardSection";
import CVSection from "./CVSection";
import PreferencesSection from "./PreferencesSection";
import BlocklistSection from "./BlocklistSection";

export type Profile = {
  name?: string;
  current_role?: string;
  years_in_sales?: number;
  quota_attainment_pct?: number;
  meetings_per_month?: number;
  segment?: string;
  motion?: string;
  tools?: string[];
  target_titles?: string[];
  markets?: string[];
  min_ote_usd?: number;
  min_ote_by_market?: Record<string, number>;
  stealth?: boolean;
  cv_file_path?: string;
  cv_text?: string;
};

export type Preferences = {
  great_company_criteria?: string[];
  valued_awards?: string[];
  countries?: string[];
  dealbreakers?: string[];
};

export type BlocklistEntry = {
  id: string;
  type: string;
  value: string;
};

const TABS = ["Scorecard", "Upload CV", "Preferences", "Blocklist"] as const;
type Tab = typeof TABS[number];

export default function ProfileClient() {
  const [tab, setTab] = useState<Tab>("Scorecard");
  const [profile, setProfile] = useState<Profile>({});
  const [prefs, setPrefs] = useState<Preferences>({});
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) setProfile(d.profile);
        if (d.preferences) setPrefs(d.preferences);
        if (d.blocklist) setBlocklist(d.blocklist);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="pt-10 text-center text-sm text-muted">Loading your profile…</div>
    );
  }

  const initials = profile.name?.trim()[0]?.toUpperCase() ?? "?";

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
        Your sales profile
      </div>
      <h1 className="font-display text-3xl font-extrabold">My profile</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Fill your scorecard any way you like. Matches update as soon as you save.
      </p>

      {/* Identity card */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-ink">
          {profile.stealth ? "?" : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {profile.stealth ? "Anonymous (stealth on)" : (profile.name || "—")}
          </div>
          <div className="text-sm text-muted">
            {[
              profile.current_role,
              profile.years_in_sales != null ? `${profile.years_in_sales} yrs` : null,
              profile.segment,
              profile.motion?.toLowerCase(),
            ]
              .filter(Boolean)
              .join(" · ") || "No scorecard yet — fill one below"}
          </div>
          {(profile.quota_attainment_pct != null || profile.meetings_per_month != null) && (
            <div className="mt-0.5 text-xs text-muted">
              {profile.quota_attainment_pct != null && `${profile.quota_attainment_pct}% quota`}
              {profile.quota_attainment_pct != null && profile.meetings_per_month != null && " · "}
              {profile.meetings_per_month != null && `${profile.meetings_per_month} meetings/mo`}
            </div>
          )}
        </div>
        {/* Stealth toggle */}
        <label className="flex cursor-pointer flex-col items-center gap-1">
          <div
            className={`relative h-6 w-11 rounded-full transition-colors ${
              profile.stealth ? "bg-accent" : "bg-line"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={!!profile.stealth}
              onChange={async (e) => {
                const stealth = e.target.checked;
                setProfile((p) => ({ ...p, stealth }));
                await fetch("/api/profile", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "profile", stealth }),
                });
              }}
            />
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                profile.stealth ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-xs text-muted">Stealth</span>
        </label>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-line bg-sunk p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-surface text-fg shadow-sm"
                : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Scorecard" && (
        <ScorecardSection
          profile={profile}
          onChange={(updates) => setProfile((p) => ({ ...p, ...updates }))}
        />
      )}
      {tab === "Upload CV" && (
        <CVSection
          onExtracted={(data, cvText) =>
            setProfile((p) => ({ ...p, ...data, cv_text: cvText }))
          }
          onTabSwitch={() => setTab("Scorecard")}
        />
      )}
      {tab === "Preferences" && (
        <PreferencesSection
          prefs={prefs}
          onChange={(updates) => setPrefs((p) => ({ ...p, ...updates }))}
        />
      )}
      {tab === "Blocklist" && (
        <BlocklistSection
          blocklist={blocklist}
          onChange={setBlocklist}
        />
      )}
    </div>
  );
}
