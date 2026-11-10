/** Round fit score badge: the ring fills to the score, with a plain-word label under it. */
export function fitLabel(score: number): { text: string; tone: "good" | "signal" | "muted" } {
  if (score >= 75) return { text: "Strong fit", tone: "good" };
  if (score >= 60) return { text: "Good fit", tone: "good" };
  if (score >= 45) return { text: "Possible", tone: "signal" };
  return { text: "Weak fit", tone: "muted" };
}

export default function FitRing({ score, size = 68 }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const { text, tone } = fitLabel(s);
  const color = tone === "signal" ? "var(--signal)" : tone === "muted" ? "var(--muted)" : "var(--accent)";
  const inner = Math.round(size * 0.76);
  return (
    <div className="flex w-[84px] shrink-0 flex-col items-center gap-1.5" role="img" aria-label={`${text}, score ${s} out of 100`}>
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: size, height: size, background: `conic-gradient(${color} 0 ${s}%, var(--line) 0)` }}>
        <span className="inline-flex items-center justify-center rounded-full bg-surface font-display font-bold num" style={{ width: inner, height: inner, fontSize: Math.round(size * 0.3) }}>{s}</span>
      </span>
      <span className="text-xs font-semibold" style={{ color }}>{text}</span>
    </div>
  );
}
