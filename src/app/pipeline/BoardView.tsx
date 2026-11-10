"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Pill, btn, btnPrimary } from "@/components/ui";
import { STAGE_LABEL, buildBoard, type BoardContact, type BoardStage, type Outcome } from "@/lib/board";

const ACCENT: Record<BoardStage, string> = { toContact: "var(--line)", waiting: "var(--signal)", replied: "var(--accent)", call: "#3b4bc8", interview: "var(--fg)" };
const MOVES: { value: string; label: string }[] = [
  { value: "", label: "Move to…" }, { value: "call_booked", label: "Call booked" }, { value: "referral", label: "They referred me" },
  { value: "interview", label: "Interview" }, { value: "declined", label: "Not interested" }, { value: "none", label: "Back to messages" },
];
const ago = (iso: string | null | undefined) => { if (!iso) return ""; const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

export default function BoardView({ contacts, outcomeReady }: { contacts: BoardContact[]; outcomeReady: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(outcomeReady ? null : { ok: false, text: "Recording calls and interviews needs the latest database update (migration 0013) to be run once. Everything else works." });
  const board = buildBoard(contacts);
  const stages = Object.keys(board.columns) as BoardStage[];

  async function move(id: string, value: string) {
    if (!value) return;
    setMsg(null);
    const res = await fetch("/api/outreach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_outcome", contact_id: id, outcome: value === "none" ? null : (value as Outcome) }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: d.error ?? "Couldn't save that." }); return; }
    router.refresh();
  }

  const Mover = ({ id }: { id: string }) => (
    <select aria-label="Move this person" defaultValue="" onChange={(e) => { void move(id, e.target.value); e.target.value = ""; }} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
      {MOVES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );

  const urgent = [...board.followUps.map((c) => ({ c, kind: "follow" as const })), ...board.needsAnswer.map((c) => ({ c, kind: "reply" as const }))];

  return (
    <div className="flex flex-col gap-8">
      {msg && <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}

      <section aria-label="Follow up today">
        <h2 className="mb-3 text-xl font-semibold">Follow up today{urgent.length ? ` · ${urgent.length}` : ""}</h2>
        {urgent.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {urgent.slice(0, 6).map(({ c, kind }) => (
              <Card key={c.id} className={kind === "reply" ? "ring-2 ring-accent" : "ring-2 ring-signal/40"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><b className="block">{c.name}</b><span className="text-sm text-muted">{c.title ? `${c.title} · ` : ""}{c.company_name}</span></div>
                  <Pill tone={kind === "reply" ? "good" : "signal"}>{kind === "reply" ? "Your turn" : "Follow-up due"}</Pill>
                </div>
                <p className="mt-2 text-sm text-muted">{kind === "reply" ? "They replied. Answer while it is fresh." : "No reply yet. A short nudge is ready for your OK."}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href="/outreach" className={btnPrimary}>{kind === "reply" ? "Open reply" : "Review follow-up"}</Link>
                  <Mover id={c.id} />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card><p className="text-sm text-muted">Nobody needs a nudge right now. Follow-ups appear here on day 3 and day 7, and replies appear the moment they arrive.</p></Card>
        )}
      </section>

      <section aria-label="Everyone by stage">
        <h2 className="mb-3 text-xl font-semibold">Everyone by stage</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {stages.map((st) => (
            <div key={st} className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-center justify-between border-b-[3px] pb-2 text-sm font-semibold" style={{ borderColor: ACCENT[st] }}>
                <span>{STAGE_LABEL[st]}</span><span className="num font-medium text-muted">{board.columns[st].length}</span>
              </div>
              {board.columns[st].slice(0, 6).map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5 rounded-xl bg-surface p-3 shadow-sm ring-1 ring-black/5">
                  <Link href="/outreach" className="font-semibold hover:text-accent">{c.name}</Link>
                  <span className="text-xs text-muted">{c.company_name}{(() => { const sent = c.steps.find((s) => s.status === "sent"); return sent?.scheduled_for ? ` · ${ago(sent.scheduled_for)}` : ""; })()}</span>
                  <Mover id={c.id} />
                </div>
              ))}
              {board.columns[st].length > 6 && <Link href="/outreach" className="px-1 text-sm text-muted hover:text-fg">+ {board.columns[st].length - 6} more</Link>}
              {board.columns[st].length === 0 && <span className="px-1 text-sm text-muted">Nobody here yet.</span>}
            </div>
          ))}
        </div>
        <Link href="/outreach" className={`${btn} mt-4`}>Open the message queue</Link>
      </section>
    </div>
  );
}
