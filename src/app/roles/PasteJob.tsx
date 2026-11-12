"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, input, label } from "@/components/ui";

type Msg = { ok: boolean; text: string } | null;

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  return res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
}

/** Paste a job link (any board) or the job text. Fetch fills the fields, you check them, Save puts it in Saved jobs. */
export default function PasteJob({ startOpen = false }: { startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState<"fetch" | "save" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [saved, setSaved] = useState(false);

  async function fetchLink() {
    setBusy("fetch"); setMsg(null); setSaved(false);
    try {
      const d = await readJson(await fetch("/api/jobs/fetch-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }));
      if (d.error) { setMsg({ ok: false, text: d.error }); return; }
      if (typeof d.url === "string") setUrl(d.url);
      setTitle((t) => t || (typeof d.title === "string" ? d.title : ""));
      setCompany((c) => c || (typeof d.company === "string" ? d.company : ""));
      setLocation((l) => l || (typeof d.location === "string" ? d.location : ""));
      if (typeof d.text === "string" && d.text) setText(d.text);
      const warn = d.relevant === false && typeof d.relevance_reason === "string" ? ` Heads up: this looks like ${d.relevance_reason}.` : "";
      setMsg({ ok: d.blocked !== true, text: `${String(d.note ?? "")}${warn}` });
    } catch { setMsg({ ok: false, text: "Couldn't reach the server. Check your connection." }); } finally { setBusy(null); }
  }

  async function save() {
    setBusy("save"); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/jobs/paste", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, text, company, title, location }) }));
      if (d.error) { setMsg({ ok: false, text: d.error }); return; }
      setMsg({ ok: true, text: `Saved: ${String(d.title)} at ${String(d.company)}${d.score != null ? `, fit ${String(d.score)}%` : ""}.` });
      setSaved(true);
      setUrl(""); setText(""); setCompany(""); setTitle(""); setLocation("");
      router.refresh();
    } catch { setMsg({ ok: false, text: "Couldn't reach the server. Check your connection." }); } finally { setBusy(null); }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-accent underline-offset-2 hover:underline">+ Save a job you found</button>;
  }
  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Save a job you found</h2>
        {!startOpen && <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-fg">Close</button>}
      </div>
      <p className="mt-1 text-sm text-muted">Paste a link from LinkedIn, Indeed, Google Jobs or any job board and press Fetch. Backchannel opens that one public page and fills in the job. If a site won&apos;t show it, paste the job text instead. Only you can see what you save.</p>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-1">
          <label htmlFor="paste-url" className={label}>Job link</label>
          <div className="flex flex-wrap gap-2">
            <input id="paste-url" className={`${input} flex-1 basis-64`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/jobs/view/..." />
            <button type="button" className={btn} disabled={busy !== null || !url.trim()} onClick={fetchLink}>{busy === "fetch" ? "Fetching…" : "Fetch"}</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1"><span className={label}>Job title</span><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="grid gap-1"><span className={label}>Company</span><input className={input} value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <label className="grid gap-1"><span className={label}>Location</span><input className={input} value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        </div>
        <label className="grid gap-1"><span className={label}>Job text</span>
          <textarea className={input} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="The job description. Fetch fills this in; paste it yourself if the site won't show it." /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={busy !== null || (!text.trim() && !url.trim())} onClick={save}>{busy === "save" ? "Saving…" : "Save job"}</button>
          {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
          {saved && <Link href="/saved" className="text-sm font-semibold text-accent">Open Saved jobs →</Link>}
        </div>
      </div>
    </div>
  );
}
