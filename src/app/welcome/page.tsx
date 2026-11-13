import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { loadSetup } from "@/lib/onboarding-load";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const db = await createClient();
  const user = await getSessionUser();
  const { steps, progress } = await loadSetup(db, user?.id ?? "");

  return (
    <section className="mx-auto max-w-2xl py-8">
      <p className="eyebrow text-muted">Set up</p>
      <h1 className="mt-2 text-4xl leading-tight">{progress.percent === 100 ? "You're all set." : "Let's get you applying."}</h1>
      <p className="mt-3 text-muted">A few minutes now means Backchannel can find, tailor and send applications for you. Each step opens the page where you do it; come back here to continue.</p>

      <div className="mt-6" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
        <div className="h-2 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full bg-accent" style={{ width: `${progress.percent}%` }} /></div>
        <p className="mt-2 text-sm text-muted">{progress.done} of {progress.total} done</p>
      </div>

      <ol className="mt-6 flex flex-col gap-3">
        {steps.map((s, i) => {
          const isNext = progress.next?.id === s.id;
          return (
            <li key={s.id} className={`flex gap-4 rounded-2xl border p-4 ${isNext ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-good text-white" : "bg-sunk text-muted"}`} aria-hidden="true">{s.done ? "✓" : i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl">{s.title}{!s.required && <span className="ml-2 text-xs text-muted">optional</span>}</h2>
                <p className="mt-1 text-sm text-muted">{s.why}</p>
              </div>
              <div className="shrink-0 self-center">
                {s.done ? <Link href={s.href} className="text-sm text-muted underline">Review</Link> : <Link href={s.href} className={`rounded-full px-4 py-2 text-sm font-semibold ${isNext ? "bg-fg text-bg" : "border border-line bg-surface"}`}>{s.cta}</Link>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8"><Link href="/home" className="text-sm font-semibold text-accent">{progress.ready ? "Go to Home →" : "Skip for now →"}</Link></div>
    </section>
  );
}
