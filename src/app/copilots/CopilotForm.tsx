"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Card, btn, btnPrimary, input, label } from "@/components/ui";
import { MAX_TITLES, SENIORITY_LABELS, SENIORITY_LEVELS, type Copilot, type CopilotInput, type Seniority } from "@/lib/copilots";

const EMPTY: CopilotInput = { name: "", titles: [], remote: true, remoteRegions: [], onsite: false, places: [], seniority: [], excludeWords: [] };

function TagInput({ id, values, onChange, max, placeholder }: { id: string; values: string[]; onChange: (next: string[]) => void; max: number; placeholder: string }) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim();
    if (!text || values.length >= max || values.some((v) => v.toLowerCase() === text.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, text]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-sm">
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="text-muted hover:text-fg" onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
          </span>
        ))}
      </div>
      {values.length < max && (
        <input
          id={id}
          className={`${input} mt-2`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
        />
      )}
    </div>
  );
}

const STEP_TITLES = ["Where and what", "Level and filters", "Review"];

export default function CopilotForm({ initial }: { initial?: Copilot }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CopilotInput>(initial ? { name: initial.name, titles: initial.titles, remote: initial.remote, remoteRegions: initial.remoteRegions, onsite: initial.onsite, places: initial.places, seniority: initial.seniority, excludeWords: initial.excludeWords } : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CopilotInput>(key: K, value: CopilotInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function next() {
    if (step === 0) {
      if (form.titles.length === 0) return setError("Add at least one job title.");
      if (!form.remote && !form.onsite) return setError("Choose remote jobs, on-site jobs, or both.");
    }
    setError(null);
    setStep((s) => s + 1);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/copilots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, id: initial?.id }) });
      const d = (await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }))) as { error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? "Couldn't save that Copilot.");
        setBusy(false);
        return;
      }
      router.push("/copilots");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  }

  function toggleLevel(level: Seniority) {
    set("seniority", form.seniority.includes(level) ? form.seniority.filter((s) => s !== level) : [...form.seniority, level]);
  }

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}</p>

      {step === 0 && (
        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="titles" className={label}>Job titles (up to {MAX_TITLES})</label>
            <p className="mb-2 mt-1 text-sm text-muted">Type a title and press Enter. &quot;sales development&quot; also finds &quot;Senior Sales Development Representative&quot;.</p>
            <TagInput id="titles" values={form.titles} onChange={(v) => set("titles", v)} max={MAX_TITLES} placeholder="For example: business development" />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.remote} onChange={(e) => set("remote", e.target.checked)} /> Remote jobs
            </label>
            {form.remote && (
              <div className="mt-2">
                <label htmlFor="regions" className="text-sm text-muted">Only remote jobs open to these places (leave empty for anywhere)</label>
                <TagInput id="regions" values={form.remoteRegions} onChange={(v) => set("remoteRegions", v)} max={10} placeholder="For example: India" />
              </div>
            )}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.onsite} onChange={(e) => set("onsite", e.target.checked)} /> On-site or hybrid jobs
            </label>
            {form.onsite && (
              <div className="mt-2">
                <label htmlFor="places" className="text-sm text-muted">Cities or countries (leave empty for anywhere)</label>
                <TagInput id="places" values={form.places} onChange={(v) => set("places", v)} max={10} placeholder="For example: Pune" />
              </div>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="mt-4 space-y-5">
          <fieldset>
            <legend className={label}>Level (leave all unticked for any level)</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SENIORITY_LEVELS.map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.seniority.includes(level)} onChange={() => toggleLevel(level)} /> {SENIORITY_LABELS[level]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="exclude" className={label}>Words to avoid in the job title</label>
            <p className="mb-2 mt-1 text-sm text-muted">For example: manager, field, door-to-door.</p>
            <TagInput id="exclude" values={form.excludeWords} onChange={(v) => set("excludeWords", v)} max={10} placeholder="Type a word and press Enter" />
          </div>
          <div>
            <label htmlFor="name" className={label}>Name (optional)</label>
            <input id="name" className={`${input} mt-2`} maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={form.titles.slice(0, 2).join(", ")} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 space-y-3 text-sm">
          <p><strong>Titles:</strong> {form.titles.join(", ")}</p>
          <p><strong>Where:</strong> {[form.remote && `Remote ${form.remoteRegions.join(", ") || "anywhere"}`, form.onsite && `On-site ${form.places.join(", ") || "anywhere"}`].filter(Boolean).join(" · ")}</p>
          <p><strong>Level:</strong> {form.seniority.length ? form.seniority.map((s) => SENIORITY_LABELS[s]).join(", ") : "Any level"}</p>
          {form.excludeWords.length > 0 && <p><strong>Avoid:</strong> {form.excludeWords.join(", ")}</p>}
          <p className="rounded-xl border border-line bg-bg p-3 text-muted">
            This Copilot finds and ranks jobs. It never sends an application by itself. To prepare one, open a job and use To apply; visa, salary,
            notice period and diversity questions will always stop and ask you.
          </p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        {step === 0 ? <Link href="/copilots" className={btn}>Cancel</Link> : <button type="button" className={btn} onClick={() => { setError(null); setStep((s) => s - 1); }}>Back</button>}
        {step < STEP_TITLES.length - 1 ? (
          <button type="button" className={btnPrimary} onClick={next}>Next</button>
        ) : (
          <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? "Saving…" : initial ? "Save changes" : "Create Copilot"}</button>
        )}
      </div>
    </Card>
  );
}
