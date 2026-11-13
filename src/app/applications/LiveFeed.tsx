"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pollDelayMs, type FeedItem } from "@/lib/apply-feed";
import { GROUP_LABEL } from "@/lib/application-status";

const DOT: Record<string, string> = { needs_you: "bg-warn", in_progress: "bg-accent", submitted: "bg-good", interview: "bg-good", offer: "bg-signal", closed: "bg-muted" };

function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export default function LiveFeed({ initial }: { initial: FeedItem[] }) {
  const [items, setItems] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stop = false;
    let latest = initial;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/apply-feed", { cache: "no-store" });
          if (!res.ok) throw new Error("bad status");
          const data = (await res.json()) as { items: FeedItem[] };
          latest = data.items;
          if (!stop) { setItems(latest); setFailed(false); setNow(Date.now()); }
        } catch { if (!stop) setFailed(true); }
      }
      if (!stop) timer.current = setTimeout(tick, pollDelayMs(latest));
    };
    timer.current = setTimeout(tick, pollDelayMs(latest));
    return () => { stop = true; if (timer.current) clearTimeout(timer.current); };
  }, [initial]);

  const active = items.filter((i) => i.active).length;
  const shown = items.slice(0, 8);

  return (
    <section aria-label="Live apply activity" className="mb-6 rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-2xl">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${active > 0 ? "animate-pulse bg-good" : "bg-muted"}`} aria-hidden="true" />
          Live activity
        </h2>
        <p className="text-sm text-muted" aria-live="polite">{active > 0 ? `${active} being worked on now` : "Nothing running right now"}{failed ? " · couldn't refresh, retrying" : ""}</p>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted">When you apply, every step shows up here as it happens. <Link href="/swipe" className="font-semibold text-accent">Start swiping</Link></p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {shown.map((i) => (
            <li key={i.id} className="flex gap-3 py-3">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${DOT[i.group]} ${i.active ? "animate-pulse" : ""}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><b>{i.title}</b> <span className="text-muted">at {i.company}</span></p>
                <p className="text-sm text-muted">{GROUP_LABEL[i.group]}: {i.headline}</p>
                {i.steps.length > 0 && i.group !== "submitted" && <p className="mt-1 truncate text-xs text-muted">Last step: {i.steps[i.steps.length - 1]}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted">{ago(i.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
