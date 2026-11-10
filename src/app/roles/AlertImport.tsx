"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, input } from "@/components/ui";
import { htmlToTextWithLinks } from "@/lib/jobs/alert-import";

export default function AlertImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Gmail puts the links in the HTML of a copy; a plain-text paste would lose them, so we take the HTML when it is there.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    setText((t) => `${t}${t ? "\n" : ""}${htmlToTextWithLinks(html)}`);
  }

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/jobs/alert-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "Something went wrong." }); return; }
      setMsg({ ok: true, text: `Added ${data.added} sales role${data.added === 1 ? "" : "s"}${data.skipped ? `; skipped ${data.skipped} (not sales or excluded)` : ""}.` });
      setText(""); router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server. Check your connection." });
    } finally { setBusy(false); }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="ml-4 text-sm font-semibold text-accent underline-offset-2 hover:underline">+ Import a job-alert email</button>;
  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Import a job-alert email</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-fg">Close</button>
      </div>
      <p className="mt-1 text-sm text-muted">Set a job alert on LinkedIn, Naukri, Instahyre, Wellfound, Bayt or Indeed. When the email arrives, open it in Gmail, select all, copy, and paste here. Every sales role in it is saved with its link and scored. Only you can see them.</p>
      <textarea className={`${input} mt-3`} rows={7} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder="Paste the alert email here" aria-label="Job alert email" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy || text.trim().length < 80} onClick={submit}>{busy ? "Reading…" : "Add the jobs"}</button>
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
