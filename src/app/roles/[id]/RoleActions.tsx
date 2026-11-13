"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary } from "@/components/ui";
import TargetButton from "@/components/TargetButton";

export default function RoleActions({ jobId, reaction, url }: { jobId: string; reaction: string | null; url: string }) {
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={reaction === "bookmarked" ? btnPrimary : btn} disabled={!!busy} onClick={() => react(reaction === "bookmarked" ? null : "bookmarked")}>{reaction === "bookmarked" ? "Saved ✓" : "Save"}</button>
        {reaction !== "skipped"
          ? <button type="button" className={btn} disabled={!!busy} onClick={() => react("skipped")}>Not for me</button>
          : <button type="button" className={btn} disabled={!!busy} onClick={() => react(null)}>Undo skip</button>}
        <TargetButton jobId={jobId} source="job" />
        {url && <a className={btnPrimary} href={url} target="_blank" rel="noopener noreferrer">Apply on company site ↗</a>}
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}
