import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { isExcludedCompany } from "@/data/companies";
import { formatCompanyName } from "@/lib/company-name";
import { classifyRelevance } from "@/lib/relevance";
import { toMarket } from "@/lib/jobs/market";
import { sanitizeResearch, EMPTY_RESEARCH, type Research } from "@/lib/company-research";
import CompanyInfo from "./CompanyInfo";
import CompanyRoles, { type CompanyRole } from "./CompanyRoles";

export const dynamic = "force-dynamic";

type JobRow = { id: string; title: string; location: string | null; remote_type: string | null; market: string | null; url: string | null; posted_at: string | null; last_checked_at: string | null; source: string | null; company_name: string | null };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const uid = user?.id ?? "";

  const { data: company } = await db.from("companies").select("id, name, domain, country, hq, sector").eq("id", id).maybeSingle();
  if (!company || isExcludedCompany(company.name, company.domain)) notFound();
  const name = formatCompanyName(company.name);

  const cols = "id, title, location, remote_type, market, url, posted_at, last_checked_at, source, company_name";
  const [{ data: own }, { data: linked }, researchRes] = await Promise.all([
    // Jobs JobRadar or you saved for this company have no company link, so they are found by name.
    db.from("jobs").select(cols).eq("is_active", true).not("added_by", "is", null).ilike("company_name", company.name).limit(200),
    db.from("jobs").select(cols).eq("is_active", true).eq("company_id", id).order("last_checked_at", { ascending: false }).limit(300),
    uid ? db.from("company_research").select("*").eq("user_id", uid).eq("company_id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const seen = new Set<string>();
  const roles: CompanyRole[] = [...(linked ?? []), ...(own ?? [])].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map((r) => {
    const j = r as unknown as JobRow;
    return {
      id: j.id, title: j.title, location: j.location ?? "", url: j.url ?? "", postedAt: j.posted_at ?? j.last_checked_at,
      market: toMarket(j.market, j.remote_type, j.location), source: j.source,
      relevant: classifyRelevance(j.title, name).relevant,
    };
  }).sort((a, b) => Number(b.relevant) - Number(a.relevant) || (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  const research: Research = researchRes.error || !researchRes.data
    ? EMPTY_RESEARCH
    : { ...sanitizeResearch(researchRes.data), researched_at: (researchRes.data.researched_at as string | null) ?? null };

  return (
    <section className="py-6">
      <Link href="/companies" className="text-sm font-semibold text-accent">← All companies</Link>
      <h1 className="mt-2 text-3xl font-bold">{name}</h1>
      <p className="mt-1 text-muted">{[company.sector, company.hq ?? company.country].filter(Boolean).join(" · ")}</p>

      <CompanyInfo companyId={company.id} name={name} domain={company.domain} initial={research} />
      <CompanyRoles roles={roles} companyName={name} />
    </section>
  );
}
