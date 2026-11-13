import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JOB_COLUMNS } from "@/lib/jobs/shared-cache";
import { Card, Pill, btn } from "@/components/ui";
import FitRing from "@/components/FitRing";
import Description from "@/components/Description";
import { openToIndia, sourceLabel } from "@/lib/role-filters";
import RoleActions from "./RoleActions";
import ApplyCard from "@/components/ApplyCard";
import type { AppRow } from "@/components/ApplyReview";
import { hasAIKey } from "@/lib/ai";
import { cleanAutoMode } from "@/lib/auto-apply";
import CompanyActions from "./CompanyActions";
import WhoToAsk from "./WhoToAsk";
import RoleBattlecard from "@/components/RoleBattlecard";
import { matchConnections, referralSearchLinks, companyKey, type Connection } from "@/lib/jobs/referral-paths";

export const dynamic = "force-dynamic";

const NEGATIVE = /outside|doesn't|isn't|below|little|haven't|can't/i;
const STAGES = [["applied", "Applied"], ["screening", "Reply or screen"], ["interview", "Interview"], ["offer", "Offer"]] as const;

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";

  const { data: job } = await db.from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (!job) notFound();
  const [{ data: score }, { data: app }, { data: autoPrefs }] = await Promise.all([
    db.from("job_scores").select("score, parts, explanation, reaction").eq("user_id", uid).eq("job_id", id).maybeSingle(),
    db.from("applications").select("*").eq("user_id", uid).eq("job_id", id).maybeSingle(),
    db.from("preferences").select("*").eq("user_id", uid).maybeSingle(),
  ]);
  const company = (job.companies as unknown as { name: string; domain: string | null } | null)?.name ?? job.company_name ?? "Unknown company";
  const domain = (job.companies as unknown as { name: string; domain: string | null } | null)?.domain ?? "";
  const parts = (score?.parts ?? []) as { label: string; value: number }[];
  const bits: string[] = String(score?.explanation ?? "").replace(/\.$/, "").split("; ").filter(Boolean);
  const fits = bits.filter((b) => !NEGATIVE.test(b));
  const gaps = bits.filter((b) => NEGATIVE.test(b));
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const indiaOk = openToIndia(job.location ?? "", job.remote_type ?? "unknown");
  const stageIdx = app ? STAGES.findIndex(([k]) => k === (app.stage ?? "applied")) : -1;

  // Referral engine: your connections here (from JobRadar's LinkedIn import) and one-click LinkedIn searches.
  // Both queries fail quietly until migration 0016 has been run.
  const firstWord = companyKey(company).split(" ")[0] ?? "";
  const [{ data: conns }, { data: prof }] = await Promise.all([
    firstWord.length >= 2
      ? db.from("connections").select("full_name, company, position, linkedin_url, connected_on").eq("user_id", uid).like("company_key", `${firstWord}%`).limit(200)
      : Promise.resolve({ data: [] as Connection[] }),
    db.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
  ]);
  const people = matchConnections((conns ?? []) as Connection[], company);
  const pr = (prof ?? {}) as { past_employers?: string[] | null; college?: string | null; cv_text?: string | null };
  const application: AppRow | null = app ? ({ ...app, jobs: { title: job.title, url: job.url ?? "", location: job.location ?? "", companies: { name: company } } } as unknown as AppRow) : null;
  const searchLinks = referralSearchLinks(company, job.title, pr.past_employers ?? [], pr.college ?? null);

  return (
    <section className="py-6">
      <Link href="/roles" className="text-sm font-semibold text-accent">← Back to matches</Link>

      <Card className="mt-4 flex flex-wrap items-center justify-between gap-5 sm:p-6">
        <div className="min-w-0 flex-1 basis-96">
          <h1 className="text-2xl font-bold sm:text-3xl">{job.title}</h1>
          <p className="mt-1 text-sm text-muted">{company} · {job.location || "Location not stated"}{job.posted_at ? ` · posted ${new Date(job.posted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : ""} · {sourceLabel(job.board ?? "")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {indiaOk && <Pill tone="good">Open to India</Pill>}
            {job.remote_type && job.remote_type !== "unknown" && <Pill>{cap(job.remote_type)}</Pill>}
            {job.pay_band_status !== "verified" && <Pill>Pay not published</Pill>}
            {job.visa_sponsorship === "yes" && <Pill tone="good">Visa sponsorship offered</Pill>}
          </div>
        </div>
        <RoleActions jobId={id} reaction={score?.reaction ?? null} url={job.url ?? ""} />
      </Card>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-6">
          <ApplyCard jobId={id} application={application} hasCv={(pr.cv_text ?? "").length > 200} aiReady={hasAIKey()} autoMode={cleanAutoMode(autoPrefs?.auto_apply_mode)} />
          <RoleBattlecard jobId={id} company={company} roleTitle={job.title} />
          {score ? (
            <Card className="flex flex-wrap gap-7 sm:p-6">
              <FitRing score={score.score ?? 0} size={110} />
              <div className="flex min-w-0 flex-1 basis-72 flex-col gap-3">
                <h2 className="text-lg font-semibold">How this score is made</h2>
                <ul className="flex flex-col gap-2.5 text-sm">
                  {parts.map((p) => (
                    <li key={p.label} className="grid grid-cols-[110px_1fr_36px] items-center gap-3">
                      <span>{p.label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="block h-full bg-accent" style={{ width: `${Math.max(2, p.value)}%` }} /></span>
                      <b className="num text-right">{Math.round(p.value)}</b>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">Pay that is not in the posting is scored as neutral, not guessed.</p>
              </div>
            </Card>
          ) : (
            <Card><p className="text-sm text-muted">This role has not been scored yet. It is scored with the next morning run, or press “Score now” on Jobs.</p></Card>
          )}

          {(fits.length > 0 || gaps.length > 0) && (
            <div className="flex flex-wrap gap-6">
              <Card className="min-w-0 flex-1 basis-72 sm:p-6">
                <h2 className="mb-3 text-lg font-semibold">Why it fits</h2>
                {fits.length ? <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">{fits.map((b) => <li key={b}>{cap(b)}.</li>)}</ul> : <p className="text-sm text-muted">Nothing stands out yet. Add your tools and target roles on your profile.</p>}
              </Card>
              <Card className="min-w-0 flex-1 basis-72 sm:p-6">
                <h2 className="mb-3 text-lg font-semibold">What is missing</h2>
                {gaps.length ? <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">{gaps.map((b) => <li key={b}>{cap(b)}.</li>)}</ul> : <p className="text-sm text-muted">No gaps found against your profile.</p>}
              </Card>
            </div>
          )}

          {job.description && (
            <Card className="sm:p-6">
              <h2 className="mb-2 text-lg font-semibold">The posting</h2>
              <Description text={job.description.slice(0, 20000)} className="max-h-[32rem] overflow-y-auto pr-2" />
            </Card>
          )}
        </div>

        <aside className="flex min-w-[280px] flex-[1_1_300px] flex-col gap-4">
          <Card>
            <h2 className="mb-2 text-[17px] font-semibold">Who to ask about this role</h2>
            <p className="mb-3 text-sm text-muted">People you know at {company}, best first, and searches to find more. You message them yourself; nothing touches your LinkedIn.</p>
            <div className="mb-3"><WhoToAsk company={company} roleTitle={job.title} jobId={id} people={people} links={searchLinks} /></div>
            <Link href={`/referrals?company=${encodeURIComponent(company)}&domain=${encodeURIComponent(domain)}&job=${encodeURIComponent(id)}`} className={btn}>Find people at {company}</Link>
          </Card>
          <Card>
            <h2 className="mb-3 text-[17px] font-semibold">Where this stands</h2>
            <ol className="flex flex-col gap-2.5 text-sm">
              <li className="flex items-center gap-2.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-ink" aria-hidden="true">✓</span>Found</li>
              {STAGES.map(([key, label], i) => {
                const done = stageIdx >= i;
                return (
                  <li key={key} className={`flex items-center gap-2.5 ${done ? "" : "text-muted"}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${done ? "bg-accent text-accent-ink" : "border-2 border-line"}`} aria-hidden="true">{done ? "✓" : ""}</span>{label}
                  </li>
                );
              })}
            </ol>
          </Card>
          <Card>
            <h2 className="mb-2 text-[17px] font-semibold">About {company}</h2>
            <p className="mb-3 text-sm text-muted">Add it to your companies so it is scanned every morning, or see all their open sales roles.</p>
            <CompanyActions company={company} domain={domain} />
          </Card>
        </aside>
      </div>
    </section>
  );
}
