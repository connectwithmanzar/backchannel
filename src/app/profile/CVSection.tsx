"use client";
import { useRef, useState } from "react";
import type { Profile } from "./ProfileClient";

type Extracted = {
  current_role: string | null;
  years: number | null;
  quota_attainment_pct: number | null;
  meetings_per_month: number | null;
  segment: string | null;
  motion: string | null;
  tools: string[];
  achievements: string[];
};

export default function CVSection({
  onExtracted,
  onTabSwitch,
}: {
  onExtracted: (data: Partial<Profile>, cvText: string) => void;
  onTabSwitch: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [cvText, setCvText] = useState("");

  async function handleFile(file: File) {
    setFileName(file.name);
    setState("uploading");
    setErrorMsg("");

    const form = new FormData();
    form.append("cv", file);

    let res: Response;
    try {
      res = await fetch("/api/extract-cv", { method: "POST", body: form });
    } catch {
      setState("error");
      setErrorMsg("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    const data = await res.json().catch(() => ({ error: `Upload failed (error ${res.status}). Try a smaller PDF or a .txt file.` }));

    if (!res.ok || data.error) {
      setState("error");
      setErrorMsg(data.error ?? "Something went wrong");
      return;
    }

    setExtracted({ ...data.extracted, tools: data.extracted?.tools ?? [], achievements: data.extracted?.achievements ?? [] });
    setCvText(data.cvText ?? "");
    setState("done");
  }

  async function handleConfirm() {
    if (!extracted) return;
    setSaving(true);

    const profileUpdates: Partial<Profile> = {
      current_role: extracted.current_role ?? undefined,
      years_in_sales: extracted.years ?? undefined,
      quota_attainment_pct: extracted.quota_attainment_pct ?? undefined,
      meetings_per_month: extracted.meetings_per_month ?? undefined,
      segment: extracted.segment ?? undefined,
      motion: extracted.motion ?? undefined,
      tools: extracted.tools,
      cv_text: cvText || undefined,
    };

    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", ...profileUpdates }),
    });

    setSaving(false);
    onExtracted(profileUpdates, cvText);
    onTabSwitch();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Upload a PDF CV. AI extracts your tools, segment and numbers — you confirm before anything is saved.
      </p>

      {/* Drop zone */}
      <div
        className="cursor-pointer rounded-2xl border-2 border-dashed border-line bg-sunk p-8 text-center transition-colors hover:border-accent"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {state === "idle" && (
          <>
            <div className="mb-2 text-3xl">📄</div>
            <p className="font-medium">Drop your CV here or click to browse</p>
            <p className="mt-1 text-xs text-muted">PDF, Word or text — up to 10 MB</p>
          </>
        )}
        {state === "uploading" && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            <p className="text-sm font-medium">Reading {fileName}…</p>
            <p className="text-xs text-muted">AI is extracting your details</p>
          </div>
        )}
        {(state === "done" || state === "error") && (
          <p className="text-xs text-muted">{fileName} · <span className="underline">Upload a different file</span></p>
        )}
      </div>

      {state === "error" && (
        <div className="rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
          {errorMsg}
        </div>
      )}

      {state === "done" && extracted && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="mb-3 font-semibold">Found in your CV — confirm before saving</h3>

          <div className="mb-4 flex flex-wrap gap-2">
            {extracted.current_role && <Chip label={extracted.current_role} />}
            {extracted.years != null && <Chip label={`${extracted.years} yrs`} />}
            {extracted.segment && <Chip label={extracted.segment} />}
            {extracted.motion && <Chip label={extracted.motion} />}
            {extracted.quota_attainment_pct != null && (
              <Chip label={`${extracted.quota_attainment_pct}% quota`} />
            )}
            {extracted.meetings_per_month != null && (
              <Chip label={`${extracted.meetings_per_month} meetings/mo`} />
            )}
            {extracted.tools.map((t) => <Chip key={t} label={t} />)}
          </div>

          {extracted.achievements.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">Key achievements</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                {extracted.achievements.slice(0, 5).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mb-3 text-xs text-muted">
            Nothing added yet. Click confirm to add these to your scorecard — you can edit them after.
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Confirm and add to scorecard"}
            </button>
            <button
              onClick={() => setState("idle")}
              className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-muted hover:text-fg"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
      {label}
    </span>
  );
}
