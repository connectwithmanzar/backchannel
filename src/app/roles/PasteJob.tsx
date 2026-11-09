"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, input, label } from "@/components/ui";

export default function PasteJob() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/jobs/paste", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, text, company, title }) });
      const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Something went wrong." }); return; }
      setMsg({ ok: true, text: `Added ${data.title} at ${data.company}${data.score != null ? `, fit ${data.score}%` : ""}.` });
      setUrl(""); setText(""); setCompany(""); setTitle("");
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-accent underline-offset-2 hover:underline">+ Add a job you found</button>;
  }
  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Add a job you found</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-fg">Close</button>
      </div>
      <p className="mt-1 text-sm text-muted">Paste the job text (best for LinkedIn, Naukri and other boards, which we never read ourselves), or a link to a public careers page. Only you can see it.</p>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1"><span className={label}>Link (optional)</span>
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jobs.lever.co/company/..." /></label>
        <label className="grid gap-1"><span className={label}>Job text</span>
          <textarea className={input} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full job post here" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1"><span className={label}>Company (optional)</span>
            <input className={input} value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <label className="grid gap-1"><span className={label}>Job title (optional)</span>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={busy || (!text.trim() && !url.trim())} onClick={submit}>{busy ? "Adding…" : "Add and score"}</button>
          {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}
