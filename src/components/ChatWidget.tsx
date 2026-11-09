"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type M = { role: "user" | "assistant"; content: string };
const SUGGEST = ["What are my 3 best matches right now?", "Which roles pay the most?", "Prep me for my top match", "What should I do today?"];

function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">{p.replace(/^https?:\/\//, "").slice(0, 40)}…</a> : <span key={i}>{p}</span>);
}

export default function ChatWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  if (path.startsWith("/login") || path.startsWith("/auth")) return null;

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: M[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const d = await res.json().catch(() => ({}));
      setMsgs([...next, { role: "assistant", content: res.ok ? d.reply : d.error ?? "Something went wrong." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Couldn't reach the server. Check your connection." }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="bc-chat"
        className="fixed z-40 rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink shadow-lg"
        style={{ right: "calc(env(safe-area-inset-right,0px) + 20px)", bottom: "calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
        {open ? "Close" : "Ask Backchannel"}
      </button>
      {open && (
        <div id="bc-chat" role="dialog" aria-label="Backchannel assistant"
          className="fixed z-40 flex flex-col rounded-2xl border border-line bg-surface shadow-2xl"
          style={{ right: "calc(env(safe-area-inset-right,0px) + 16px)", bottom: "calc(env(safe-area-inset-bottom,0px) + 80px)", width: "min(400px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 140px))" }}>
          <div className="border-b border-line px-4 py-3"><b className="font-display text-lg">Backchannel AI</b><div className="text-xs text-muted">Answers from your roles, applications and outreach</div></div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">
            {!msgs.length && <div className="rounded-xl bg-sunk p-3">Ask me about your best matches, pay, visas, what to do today, or interview prep.</div>}
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 ${m.role === "user" ? "self-end bg-accent text-accent-ink" : "self-start bg-sunk"}`}>{m.role === "assistant" ? linkify(m.content) : m.content}</div>
            ))}
            {busy && <div className="self-start rounded-xl bg-sunk px-3 py-2 text-muted">Thinking…</div>}
            <div ref={end} />
          </div>
          {!msgs.length && <div className="flex flex-wrap gap-1.5 px-3 pb-2">{SUGGEST.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-2.5 py-1 text-xs">{s}</button>)}</div>}
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <input id="bc-chat-in" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything about your search" aria-label="Message" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2" />
            <button disabled={busy} className="rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink disabled:opacity-60">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
