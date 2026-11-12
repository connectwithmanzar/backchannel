"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Pill, btnPrimary, input } from "@/components/ui";
import { postJson } from "@/lib/api";
import ApplyReview, { type AppRow } from "@/components/ApplyReview";

const STAGES = [["applied", "Applied"], ["screening", "Screening"], ["interview", "Interview"], ["final", "Final round"], ["offer", "Offer"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"]];

/** Everything about applying to one job: prepare, review, submit and track. The same card on every job page. */
export default function ApplyCard({ jobId, application, hasCv, aiReady }: { jobId: string; application: AppRow | null; hasCv: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(key: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson("/api/applications", body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const status = application?.status ?? null;
  const inReview = status === "needs_answer" || status === "awaiting_approval";
  const applied = status === "submitted";

  return (
    <Card className="sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Apply to this job</h2>
        {inReview && (status === "needs_answer" ? <Pill tone="warn">Confirm your answers</Pill> : <Pill tone="good">Ready to submit</Pill>)}
        {applied && <Pill tone="good">Applied{application?.submitted_at ? ` ${new Date(application.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</Pill>}
      </div>

      {!hasCv && <p className="mt-3 rounded-xl bg-signal-soft px-3 py-2 text-sm text-signal">Upload your CV on <Link className="underline" href="/profile">your profile</Link> first. Only facts from your CV are ever used.</p>}
      {!aiReady && <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">AI isn&apos;t connected yet, so applications can&apos;t be prepared.</p>}
      {msg && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}

      {!application || status === "skipped" ? (
        <div className="mt-3">
          <p className="mb-3 text-sm text-muted">One click builds your tailored CV, a cover note and answers to the likely form questions, using only facts from your CV. Visa, salary, notice period and similar questions always stop and ask you.</p>
          <button type="button" className={btnPrimary} disabled={!!busy || !hasCv || !aiReady}
            onClick={() => act("prepare", { action: "prepare", job_id: jobId }, "Your application is ready to review below.")}>
            {busy === "prepare" ? "Preparing… (about 30 seconds)" : status === "skipped" ? "Prepare again" : "Prepare application"}
          </button>
        </div>
      ) : inReview && application ? (
        <div className="mt-4 border-t border-line pt-4"><ApplyReview a={application} busy={busy} act={act} /></div>
      ) : applied && application ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><span className="text-muted">Stage</span>
            <select aria-label="Stage" className={input + " w-auto"} value={application.stage ?? "applied"} disabled={!!busy}
              onChange={(e) => act("stage", { action: "stage", id: application.id, stage: e.target.value }, "Stage updated.")}>
              {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {application.receipt && <span className="text-muted">Receipt: {application.receipt}</span>}
        </div>
      ) : null}
    </Card>
  );
}
