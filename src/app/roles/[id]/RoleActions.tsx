"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary } from "@/components/ui";

export default function RoleActions({ jobId, reaction, hasApplication, url }: { jobId: string; reaction: string | null; hasApplication: boolean; url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function react(next: "bookmarked" | "skipped" | null) {
    setBusy("react"); setMsg(null);
    const res = await fetch("/api/job-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: jobId, reaction: next }) });
    setBusy("");
    if (!res.ok) { setMsg({ ok: false, text: "Couldn't save that. Try again." }); return; }
    router.refresh();
  }

  async function tailor() {
    setBusy("tailor"); setMsg(null);
    const res = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prepare", job_id: jobId }) });
    const d = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
    setBusy("");
    if (!res.ok) { setMsg({ ok: false, text: d.error ?? "Couldn't prepare that." }); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={reaction === "bookmarked" ? btnPrimary : btn} disabled={!!busy} onClick={() => react(reaction === "bookmarked" ? null : "bookmarked")}>{reaction === "bookmarked" ? "Saved ✓" : "Save"}</button>
        {reaction !== "skipped"
          ? <button type="button" className={btn} disabled={!!busy} onClick={() => react("skipped")}>Not for me</button>
          : <button type="button" className={btn} disabled={!!busy} onClick={() => react(null)}>Undo skip</button>}
        {url && <a className={btnPrimary} href={url} target="_blank" rel="noopener noreferrer">Apply on company site ↗</a>}
      </div>
      {!hasApplication && (
        <div><button type="button" className={btn} disabled={!!busy} onClick={tailor}>{busy === "tailor" ? "Tailoring your CV… (about 30 seconds)" : "Tailor my CV to this role"}</button></div>
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}
