import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="text-xs font-bold uppercase tracking-wider text-accent">{eyebrow}</div>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h1>
      {children && <div className="mt-2 max-w-[66ch] text-muted">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-card border border-line bg-surface p-4 shadow-[0_2px_12px_rgba(81,101,184,0.08)] sm:p-5 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-dashed border-accent/30 bg-surface p-8 text-center text-sm text-muted">{children}</div>;
}

export const btn = "inline-flex items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-surface px-5 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60";
export const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
export const input = "w-full min-w-0 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm focus:border-accent";
export const label = "text-xs font-semibold uppercase tracking-wider text-muted";

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "signal" | "accent"; children: ReactNode }) {
  const t = {
    neutral: "bg-sunk text-fg",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    signal: "bg-signal-soft text-signal",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}
