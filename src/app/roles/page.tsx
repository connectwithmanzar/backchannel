import { loadJobs, loadProfile } from "@/lib/data";
import { scoreJob } from "@/lib/score";
import RolesFeed from "./RolesFeed";

export const dynamic = "force-dynamic";

export default function RolesPage() {
  const { jobs, collectedAt, sample } = loadJobs();
  const profile = loadProfile();
  const scored = jobs.map((j) => scoreJob(j, profile)).sort((a, b) => b.score - a.score);
  return (
    <section className="py-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">For SDR · BDR · GTM · B2B sales</div>
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Every sales role that fits you</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Collected daily from company careers pages and scored against your profile. Hidden roles and job boards come in later builds.
      </p>
      {sample ? (
        <div className="mt-4 rounded-card bg-signal-soft px-4 py-3 text-sm text-signal">
          Showing <b>sample roles</b>. Run <code className="font-mono">npm run collect</code> to load real roles from your company list.
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted num">Last collected {collectedAt ? new Date(collectedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"} IST</p>
      )}
      <RolesFeed jobs={scored} />
    </section>
  );
}
