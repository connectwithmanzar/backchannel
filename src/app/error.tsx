"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-extrabold">That didn&apos;t load</h1>
      <p className="mt-2 text-muted">Something went wrong on our side. Your data is safe. Try again, or go back to Today.</p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90">Try again</button>
        <Link href="/today" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-fg/40">Go to Today</Link>
      </div>
    </div>
  );
}
