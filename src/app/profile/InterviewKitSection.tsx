"use client";
import { useEffect, useState } from "react";
import { Card, btn, btnPrimary, input } from "@/components/ui";

type Story = { id: string; title: string; situation: string; action: string; result: string };
type Msg = { ok: boolean; text: string } | null;

const EMPTY = { title: "", situation: "", action: "", result: "" };

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  return res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
}

function GapLine() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/gap-line").then(readJson).then((d) => {
      setText(typeof d.gap_line === "string" ? d.gap_line : "");
      if (d.error) setMsg({ ok: false, text: d.error });
    }).catch(() => setMsg({ ok: false, text: "Couldn't load it. Check your connection." }));
  }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/gap-line", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gap_line: text }) }));
      setMsg(d.error ? { ok: false, text: d.error } : { ok: true, text: "Saved." });
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(false); }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Your career-gap line</h2>
      <p className="mt-1 text-sm text-muted">One honest sentence you can use on a CV and out loud. You write it; Backchannel never invents a reason. Leave it blank if you have no gap to explain.</p>
      <label className="mt-3 block text-sm font-semibold" htmlFor="gap-line">Gap line</label>
      <textarea id="gap-line" rows={2} maxLength={400} className={`${input} mt-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Example: Career break for family reasons, then back to work and fully available." />
      <div className="mt-3 flex items-center gap-3"><button type="button" className={btnPrimary} onClick={save} disabled={busy}>Save</button>{msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}</div>
    </Card>
  );
}

function StoryBank() {
  const [stories, setStories] = useState<Story[]>([]);
  const [draft, setDraft] = useState<{ id?: string } & typeof EMPTY>(EMPTY);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await readJson(await fetch("/api/stories"));
      setStories(Array.isArray(d.stories) ? (d.stories as Story[]) : []);
      if (d.error) setMsg({ ok: false, text: d.error });
    } catch { setMsg({ ok: false, text: "Couldn't load your stories. Check your connection." }); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/stories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }));
      if (d.error) { setMsg({ ok: false, text: d.error }); return; }
      setDraft(EMPTY); setMsg({ ok: true, text: "Story saved." }); await load();
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/stories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setStories((s) => s.filter((x) => x.id !== id));
    else setMsg({ ok: false, text: "Couldn't delete that." });
  }

  const field = (key: "situation" | "action" | "result", label: string, hint: string) => (
    <label className="block text-sm font-semibold">{label}
      <textarea rows={2} maxLength={1500} className={`${input} mt-1 font-normal`} value={draft[key]} placeholder={hint} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
    </label>
  );

  return (
    <Card>
      <h2 className="text-lg font-semibold">Story bank</h2>
      <p className="mt-1 text-sm text-muted">Three to five real stories you can tell in an interview: what the situation was, what you did, and the result with a number if you have one. Practice answers are checked against these.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {stories.map((s) => (
          <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex items-start justify-between gap-3"><b>{s.title}</b>
              <span className="flex gap-2"><button type="button" className="font-semibold text-accent" onClick={() => setDraft({ id: s.id, title: s.title, situation: s.situation, action: s.action, result: s.result })}>Edit</button>
                <button type="button" className="font-semibold text-warn" onClick={() => remove(s.id)}>Delete</button></span></div>
            {s.result && <p className="mt-1 text-muted">Result: {s.result}</p>}
          </li>
        ))}
        {stories.length === 0 && <li className="text-sm text-muted">No stories yet. Add your first below.</li>}
      </ul>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
        <label className="block text-sm font-semibold">Title
          <input type="text" maxLength={120} className={`${input} mt-1 font-normal`} value={draft.title} placeholder="Example: Built a signal-based prospecting workflow" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </label>
        {field("situation", "Situation", "What was the problem or goal?")}
        {field("action", "What you did", "Your own steps, tools and decisions.")}
        {field("result", "Result", "What changed, with a real number if you have one.")}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} onClick={save} disabled={busy}>{draft.id ? "Update story" : "Save story"}</button>
          {draft.id && <button type="button" className={btn} onClick={() => setDraft(EMPTY)}>Cancel edit</button>}
          {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
        </div>
      </div>
    </Card>
  );
}

export default function InterviewKitSection() {
  return <div className="flex flex-col gap-5"><GapLine /><StoryBank /></div>;
}
