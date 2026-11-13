import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { hasAIKey } from "@/lib/ai";
import { formatCompanyName } from "@/lib/company-name";
import FindPeople from "./FindPeople";
import { apolloConfigured } from "@/lib/contacts/apollo";
import { webSearchConfigured } from "@/lib/websearch";
import ReferralFinder from "./ReferralFinder";
import { findReferralPaths, sizeBucket, type CompanySize } from "@/lib/referral-finder";
import type { Connection } from "@/lib/jobs/referral-paths";
import ReferralsClient, { type Ref, type JobOpt } from "./ReferralsClient";

export const dynamic = "force-dynamic";

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ company?: string; domain?: string; role?: string; size?: string; location?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";
  const [{ data: refs }, { data: jobs }] = await Promise.all([
    db.from("referrals").select("*").eq("user_id", uid).order("updated_at", { ascending: false }),
    db.from("job_scores").select("job_id, jobs!inner(title, location, is_active, companies(name))").eq("user_id", uid).eq("jobs.is_active", true).order("score", { ascending: false }).limit(60),
  ]);
  const opts: JobOpt[] = (jobs ?? []).map((j) => {
    const x = j.jobs as unknown as { title: string; location: string | null; companies: { name: string } | null };
    return { id: j.job_id, title: x.location ? `${x.title} (${x.location.slice(0, 40)})` : x.title, company: formatCompanyName(x.companies?.name) };
  });
  // Referral finder: your own connections at the company, then the right people by company size.
  const company = (sp.company ?? "").trim().slice(0, 200);
  const role = (sp.role ?? "").trim().slice(0, 200);
  const location = (sp.location ?? "").trim().slice(0, 100);
  const [{ data: conns, count: connectionCount }, { data: known }] = await Promise.all([
    db.from("connections").select("full_name, company, position, linkedin_url, connected_on", { count: "exact" }).eq("user_id", uid).limit(5000),
    company ? db.from("companies").select("size").ilike("name", company).limit(1) : Promise.resolve({ data: null }),
  ]);
  const knownSize = sizeBucket((known as { size: string | null }[] | null)?.[0]?.size);
  const asked = ["small", "mid", "large"].includes(sp.size ?? "") ? (sp.size as CompanySize) : null;
  const size: CompanySize = asked ?? knownSize ?? "mid";
  const result = company ? findReferralPaths({ company, roleTitle: role, size, location, connections: (conns ?? []) as Connection[] }) : null;

  return (
    <section className="py-6">
      <PageHeader eyebrow="Referrals" title="Warm intros, tracked">
        A referral is the fastest way past the pile. Add someone you know at a company, let AI draft a short ask from your real numbers, send it yourself, and track it from asked to interview.
      </PageHeader>
      <ReferralFinder query={{ company, role, size, location }} sizeKnown={!!(asked ?? knownSize)} result={result} connectionCount={connectionCount ?? 0} />
      {(apolloConfigured() || webSearchConfigured()) && <FindPeople configured={apolloConfigured() || hasAIKey() || webSearchConfigured()} initialCompany={(sp.company ?? "").slice(0, 200)} initialDomain={(sp.domain ?? "").slice(0, 200)} />}
      <ReferralsClient refs={(refs ?? []) as Ref[]} jobs={opts} aiReady={hasAIKey()} />
    </section>
  );
}
