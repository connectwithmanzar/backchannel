export default function Placeholder({ eyebrow, title, text, step }: { eyebrow: string; title: string; text: string; step: string }) {
  return (
    <section className="py-8">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{eyebrow}</div>
      <h1 className="mt-1 text-3xl font-extrabold">{title}</h1>
      <p className="mt-2 max-w-[62ch] text-muted">{text}</p>
      <div className="mt-6 rounded-card border border-dashed border-line p-6 text-sm text-muted">Coming in build {step}. See backchannel-build-brief.md.</div>
    </section>
  );
}
