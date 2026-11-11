"use client";
import { useEffect, useState } from "react";
import { Card, btn, btnPrimary, input } from "@/components/ui";
import { CV_FAMILIES, type CvFamilyId } from "@/lib/cv-versions";

type Msg = { ok: boolean; text: string } | null;

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  return res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
}

export default function CVVersionsSection() {
  const [family, setFamily] = useState<CvFamilyId>("gtm");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);

  useEffect(() => {
    fetch("/api/cv-versions").then(readJson).then((d) => {
      const map: Record<string, string> = {};
      for (const v of (Array.isArray(d.versions) ? d.versions : []) as { family: string; cv_text: string }[]) map[v.family] = v.cv_text;
      setSaved(map); setText(map.gtm ?? "");
      if (d.error) setMsg({ ok: false, text: d.error });
    }).catch(() => setMsg({ ok: false, text: "Couldn't load your versions. Check your connection." }));
  }, []);

  function pick(id: CvFamilyId) { setFamily(id); setText(saved[id] ?? ""); setMsg(null); }

  async function draft() {
    setBusy("draft"); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/cv-versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ family, action: "draft" }) }));
      if (d.error) setMsg({ ok: false, text: d.error });
      else { setText(String(d.text ?? "")); setMsg({ ok: true, text: "Draft ready. Read every line against your real CV, edit it, then save." }); }
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(null); }
  }

  async function save() {
    setBusy("save"); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/cv-versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ family, cv_text: text }) }));
      if (d.error) setMsg({ ok: false, text: d.error });
      else { setSaved((s) => ({ ...s, [family]: text })); setMsg({ ok: true, text: "Version saved." }); }
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(null); }
  }

  const current = CV_FAMILIES.find((f) => f.id === family)!;
  return (
    <Card>
      <h2 className="text-lg font-semibold">CV versions</h2>
      <p className="mt-1 text-sm text-muted">One CV per kind of role, built from your master CV. The draft only reorders and trims what is already true. You review it before saving.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Role kind">
        {CV_FAMILIES.map((f) => (
          <button key={f.id} type="button" aria-pressed={family === f.id} onClick={() => pick(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${family === f.id ? "bg-accent text-accent-ink" : "bg-surface text-muted ring-1 ring-line hover:text-fg"}`}>
            {f.label}{saved[f.id] ? " ✓" : ""}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">Leads with: {current.focus}.</p>
      <label className="mt-3 block text-sm font-semibold" htmlFor="cv-version">{current.label} CV</label>
      <textarea id="cv-version" rows={16} className={`${input} mt-1 font-mono text-[13px] font-normal`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Press Draft from my master CV, or paste your own version." />
      <p className="mt-2 text-xs text-muted">Format rules for job portals: single column, standard headings (Summary, Experience, Skills, Education), plain text, no tables or icons.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btn} onClick={draft} disabled={busy !== null}>{busy === "draft" ? "Drafting…" : "Draft from my master CV"}</button>
        <button type="button" className={btnPrimary} onClick={save} disabled={busy !== null || text.trim().length < 50}>{busy === "save" ? "Saving…" : "Save this version"}</button>
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}
