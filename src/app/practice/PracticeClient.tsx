"use client";
import { useEffect, useRef, useState } from "react";
import { Card, btn, btnPrimary, input } from "@/components/ui";
import { PRACTICE_QUESTIONS } from "@/lib/practice-questions";

// The browser's own speech recognition (Chrome and Safari). It is not available everywhere, so dictation is optional.
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export default function PracticeClient({ aiReady }: { aiReady: boolean }) {
  const [qid, setQid] = useState(PRACTICE_QUESTIONS[0].id);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => { setCanDictate(recognitionCtor() !== null); return () => recRef.current?.stop(); }, []);

  const question = PRACTICE_QUESTIONS.find((q) => q.id === qid) ?? PRACTICE_QUESTIONS[0];

  function pick(id: string) { setQid(id); setAnswer(""); setFeedback(""); setError(""); }

  function toggleDictation() {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.interimResults = false; rec.continuous = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
      if (said) setAnswer((a) => `${a}${a ? " " : ""}${said}`);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setError("Dictation stopped. You can keep typing instead."); };
    recRef.current = rec; setListening(true); setError(""); rec.start();
  }

  async function getFeedback() {
    setBusy(true); setError(""); setFeedback("");
    try {
      const res = await fetch("/api/practice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question_id: qid, answer }) });
      const d = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
      if (!res.ok || d.error) setError(d.error ?? "Something went wrong.");
      else setFeedback(String(d.content ?? ""));
    } catch { setError("Couldn't reach the server. Check your connection."); } finally { setBusy(false); }
  }

  const groups = ["Sales", "GTM", "About you"] as const;
  return (
    <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Questions" className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">{g}</span>
            {PRACTICE_QUESTIONS.filter((q) => q.group === g).map((q) => (
              <button key={q.id} type="button" aria-pressed={qid === q.id} onClick={() => pick(q.id)}
                className={`rounded-xl px-3 py-2.5 text-left text-sm ${qid === q.id ? "bg-accent-soft font-semibold text-fg" : "border border-line bg-surface text-muted hover:text-fg"}`}>
                {q.text}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <h2 className="text-lg font-semibold">{question.text}</h2>
          <label htmlFor="practice-answer" className="mt-3 block text-sm font-semibold">Your answer</label>
          <textarea id="practice-answer" rows={8} maxLength={3000} className={`${input} mt-1 font-normal`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer as you would in the interview. Use real numbers only." />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} onClick={getFeedback} disabled={busy || !aiReady || answer.trim().length < 20}>{busy ? "Reading your answer…" : "Get feedback"}</button>
            {canDictate && <button type="button" className={btn} aria-pressed={listening} onClick={toggleDictation}>{listening ? "Stop dictating" : "Dictate instead"}</button>}
            <button type="button" className={btn} onClick={() => { setAnswer(""); setFeedback(""); setError(""); }}>Clear</button>
          </div>
          {!aiReady && <p className="mt-3 text-sm text-warn">AI feedback is switched off right now. This is a setup issue, not something you did.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-warn">{error}</p>}
        </Card>
        {feedback && (
          <Card>
            <h2 className="text-lg font-semibold">Feedback</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{feedback}</p>
            <p className="mt-3 text-xs text-muted">Check every line against what is true before you use it. Nothing here is saved.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
