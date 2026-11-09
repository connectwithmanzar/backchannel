"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, Card, input, Pill } from "@/components/ui";
import { postJson } from "@/lib/api";
import { MERGE_FIELDS } from "@/lib/outreach/templates";

export interface AutoSendState {
  subject: string; body: string; approved: boolean;
  enabled: boolean; minFit: number; daysSending: number; gmailConnected: boolean;
}

export default function AutoSendCard({ state }: { state: AutoSendState }) {
  const router = useRouter();
  const [subject, setSubject] = useState(state.subject);
  const [body, setBody] = useState(state.body);
  const [minFit, setMinFit] = useState(state.minFit);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const edited = subject !== state.subject || body !== state.body;

  async function act(key: string, payload: object, ok: string) {
    setBusy(key); setMsg(null);
    try { await postJson("/api/outreach", payload); setMsg({ ok: true, text: ok }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  }

  const weekLeft = Math.max(0, 7 - state.daysSending);
  return (
    <Card className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Auto-send (off unless you switch it on)</h2>
        <Pill tone={state.enabled ? "good" : "neutral"}>{state.enabled ? "On" : "Off"}</Pill>
      </div>
      <p className="text-sm text-muted">
        Write one email yourself and approve it. For roles scoring at or above your minimum fit, the first email to a person you add then goes out from your approved text, during the recipient&apos;s own morning (9:00 to 11:30 their time) and inside your daily limit.
        Follow-ups, LinkedIn steps and applications always wait for you. Sensitive questions never auto-send. It stops on any reply or bounce, and pauses if more than 2% of recent emails bounce.
        {state.daysSending < 7 && ` The first week every email needs your approval, so auto-send starts working ${state.daysSending === 0 && !state.gmailConnected ? "once you've sent for 7 days" : `in about ${weekLeft} day${weekLeft === 1 ? "" : "s"}`} of sending.`}
      </p>
      <input aria-label="Subject" className={input} placeholder="Subject, e.g. Quick question about {role_title} at {company}" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea aria-label="Message" rows={7} className={input} placeholder={"Hi {first_name},\n\n...your own words...\n\n{sender_name}"} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-muted">Allowed fields: {MERGE_FIELDS.map((f) => `{${f}}`).join(" ")}. Your signature and an opt-out line are added automatically.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} disabled={!!busy || !subject.trim() || !body.trim() || !edited} onClick={() => act("save", { action: "save_template", subject, body }, "Saved. Approve it to use it.")}>{busy === "save" ? "Saving…" : "Save"}</button>
        <button className={btnPrimary} disabled={!!busy || edited || (!state.subject && !state.body) || state.approved} onClick={() => act("approve", { action: "approve_template" }, "Approved. This exact text can now auto-send.")}>{state.approved ? "Approved" : busy === "approve" ? "Approving…" : "Approve this text"}</button>
        {edited && <span className="text-xs text-warn">Unsaved changes. Save, then approve.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-sm">Minimum fit
          <input type="number" min={60} max={95} className={input + " w-20"} value={minFit} onChange={(e) => setMinFit(+e.target.value)} /></label>
        <button className={state.enabled ? btn : btnPrimary} disabled={!!busy || (!state.enabled && !state.approved)}
          onClick={() => act("toggle", { action: "autosend_settings", enabled: !state.enabled, min_fit: minFit }, state.enabled ? "Auto-send is off." : "Auto-send is on.")}>
          {state.enabled ? "Switch off" : "Switch on"}
        </button>
        {state.enabled && <button className={btn} disabled={!!busy} onClick={() => act("fit", { action: "autosend_settings", enabled: true, min_fit: minFit }, "Saved.")}>Save minimum fit</button>}
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </Card>
  );
}
