import Link from "next/link";
import { Card, Pill } from "@/components/ui";
import { SIZE_LABEL, type CompanySize, type FinderResult } from "@/lib/referral-finder";

interface Props {
  query: { company: string; role: string; size: CompanySize; location: string };
  sizeKnown: boolean;
  result: FinderResult | null;
  connectionCount: number;
}

const field = "w-full min-w-0 rounded-full border border-line bg-surface px-5 py-3 text-sm";

/** Who to ask for a referral: your own connections at the company first, then the right people by company size. Plain links, no scripts. */
export default function ReferralFinder({ query, sizeKnown, result, connectionCount }: Props) {
  return (
    <Card className="mb-6 flex flex-col gap-4">
      <div>
        <h2 className="text-2xl">Find who to ask</h2>
        <p className="mt-1 text-sm text-muted">Works for any job you find anywhere. Mutual connections come first, then the best people to contact for a company of that size. You open LinkedIn yourself; nothing is automated there.</p>
      </div>

      <form method="get" action="/referrals" className="grid gap-3 sm:grid-cols-2">
        <input name="company" defaultValue={query.company} required placeholder="Company, e.g. Harvey" aria-label="Company" className={field} />
        <input name="role" defaultValue={query.role} placeholder="Role you want, e.g. Account Executive" aria-label="Role" className={field} />
        <select name="size" defaultValue={query.size} aria-label="Company size" className={field}>
          {(Object.keys(SIZE_LABEL) as CompanySize[]).map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
        </select>
        <input name="location" defaultValue={query.location} placeholder="City (optional), e.g. Bengaluru" aria-label="City" className={field} />
        <button type="submit" className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-bg sm:col-span-2">Find people</button>
      </form>
      {result && !sizeKnown && <p className="text-xs text-muted">We don&apos;t know this company&apos;s size, so I assumed mid-size. Change it above if that&apos;s wrong, because it changes who comes first.</p>}

      {result && result.groups.length === 0 && <p className="text-sm text-muted">Nothing to search for. This company is on your never-contact list, or the name is empty.</p>}

      {result && result.groups.length > 0 && (
        <div className="flex flex-col gap-6">
          <section aria-label="People you already know">
            <h3 className="text-xl">1. People you already know at {result.company}</h3>
            {result.mutuals.length > 0 ? (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {result.mutuals.map((c) => (
                  <li key={`${c.full_name}-${c.linkedin_url}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span><b>{c.full_name}</b> <span className="text-muted">· {c.position || "role not listed"}</span></span>
                    <span className="flex items-center gap-3">
                      <Pill tone="good">Connected</Pill>
                      {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent">Message on LinkedIn ↗</a>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {connectionCount === 0
                  ? "I don't have your LinkedIn connections yet. Export them from LinkedIn (Settings → Data privacy → Get a copy of your data → Connections) and import the file in JobRadar. Then people you know show up here first."
                  : `None of your ${connectionCount} saved connections work at ${result.company}. Try the friends-of-friends links below.`}
              </p>
            )}
          </section>

          <section aria-label="Who to contact">
            <h3 className="text-xl">2. Then these people, in this order</h3>
            <ol className="mt-3 flex flex-col gap-3">
              {result.groups.map((g, i) => (
                <li key={g.key} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="font-semibold">{i + 1}. {g.label}</p>
                  <p className="mt-0.5 text-sm text-muted">{g.why}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {g.links.map((l) => <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line bg-bg px-4 py-1.5 text-sm font-semibold text-accent hover:bg-sunk">{l.label} ↗</a>)}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted">Found someone? Add them below under &ldquo;Warm intros&rdquo; and let AI draft the ask, or <Link href="/targets" className="font-semibold text-accent">go back to your Target list</Link>.</p>
          </section>
        </div>
      )}
    </Card>
  );
}
