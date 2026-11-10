import { serviceClient } from "@/lib/supabase/service";
import { COMPANY_SEEDS, isExcludedCompany } from "@/data/companies";
import { BoardNotFound, discoverBoard, fetchBoard, type AtsType } from "@/lib/collectors/ats";
import { isSalesRole, normalise } from "@/lib/jobs/process";
import { fetchAggregators } from "@/lib/collectors/aggregators";

export type CompanyResult = {
  company_id: string;
  company: string;
  ats: string;
  slug: string;
  fetched: number;
  sales: number;
  error?: string;
  repaired_to?: string;
};

type CompanyRow = { id: string; name: string; domain: string | null; ats_type: AtsType; ats_slug: string };

const CONCURRENCY = 8;
const TIME_BUDGET_MS = 240_000;

/** Makes sure every seed company exists in the companies table (keeps any enabled/disabled choice). */
export async function syncSeeds() {
  const svc = serviceClient();
  // Skip seeds already present by name, so a repaired or disabled company is never re-added with its old slug.
  const { data: existing } = await svc.from("companies").select("name");
  const have = new Set((existing ?? []).map((r: { name: string }) => r.name.toLowerCase()));
  const rows = COMPANY_SEEDS.filter((s) => s.enabled && !have.has(s.name.toLowerCase())).map((s) => ({
    name: s.name, domain: s.domain, country: s.country, ats_type: s.ats_type, ats_slug: s.ats_slug, careers_url: s.careers_url,
  }));
  if (rows.length) await svc.from("companies").upsert(rows, { onConflict: "ats_type,ats_slug", ignoreDuplicates: true });
}

async function ingestCompany(c: CompanyRow, repair: boolean): Promise<CompanyResult> {
  const svc = serviceClient();
  const base: CompanyResult = { company_id: c.id, company: c.name, ats: c.ats_type, slug: c.ats_slug, fetched: 0, sales: 0 };
  let raw;
  try {
    raw = await fetchBoard(c.ats_type, c.ats_slug);
  } catch (e) {
    // A wrong slug: try to find the company's real board once, and fix the record.
    if (repair && e instanceof BoardNotFound) {
      const found = await discoverBoard(c.name, c.domain);
      if (found) {
        const { error } = await svc.from("companies").update({ ats_type: found.ats, ats_slug: found.slug, collect_error: null }).eq("id", c.id);
        if (!error) {
          return ingestCompany({ ...c, ats_type: found.ats, ats_slug: found.slug }, false).then((r) => ({ ...r, repaired_to: `${found.ats}/${found.slug}` }));
        }
      }
    }
    const msg = (e as Error).message;
    await svc.from("companies").update({ collect_error: msg, last_collected_at: new Date().toISOString() }).eq("id", c.id);
    return { ...base, error: msg };
  }

  // An empty board often means the company moved ATS (SmartRecruiters and Ashby return empty lists, not 404).
  if (repair && raw.length === 0) {
    const found = await discoverBoard(c.name, c.domain);
    if (found && !(found.ats === c.ats_type && found.slug === c.ats_slug)) {
      const { error } = await svc.from("companies").update({ ats_type: found.ats, ats_slug: found.slug }).eq("id", c.id);
      if (!error) {
        const r = await ingestCompany({ ...c, ats_type: found.ats, ats_slug: found.slug }, false);
        return { ...r, repaired_to: `${found.ats}/${found.slug}` };
      }
    }
  }

  const now = new Date().toISOString();
  const rows = raw
    .filter((r) => isSalesRole(r.title))
    .map((r) => ({ company_id: c.id, ...normalise(r, c.name), last_checked_at: now, is_active: true }));
  // Same company + title + location can appear twice in one feed; keep one.
  const unique = [...new Map(rows.map((r) => [r.dedupe_hash, r])).values()];

  if (unique.length) {
    const { error } = await svc.from("jobs").upsert(unique, { onConflict: "dedupe_hash" });
    if (error) return { ...base, fetched: raw.length, error: `save failed: ${error.message}` };
  }
  // Roles that vanished from the board are closed.
  const live = unique.map((r) => r.dedupe_hash);
  let q = svc.from("jobs").update({ is_active: false }).eq("company_id", c.id).eq("is_active", true);
  if (live.length) q = q.not("dedupe_hash", "in", `(${live.join(",")})`);
  await q;

  await svc.from("companies").update({ collect_error: null, last_collected_at: now, open_sales_roles: unique.length }).eq("id", c.id);
  return { ...base, fetched: raw.length, sales: unique.length };
}

/** Collects sales roles from every enabled company board, in parallel, within the time budget. */
export async function runIngestion(opts: { companyId?: string; companyIds?: string[]; repair?: boolean } = {}) {
  const started = Date.now();
  const svc = serviceClient();
  await syncSeeds();

  let q = svc.from("companies").select("id, name, domain, ats_type, ats_slug").eq("enabled", true)
    .in("ats_type", ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"]).not("ats_slug", "is", null);
  if (opts.companyId) q = q.eq("id", opts.companyId);
  if (opts.companyIds) q = q.in("id", opts.companyIds);
  const { data, error } = await q;
  if (error) throw new Error(`Could not read companies: ${error.message}`);

  const companies = (data as CompanyRow[]).filter((c) => !isExcludedCompany(c.name, c.domain, c.ats_slug));
  const results: CompanyResult[] = [];
  const queue = [...companies];
  let skipped = 0;

  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      if (Date.now() - started > TIME_BUDGET_MS) { skipped++; continue; }
      results.push(await ingestCompany(c, opts.repair ?? true));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const summary = {
    companies_checked: results.length,
    companies_skipped_for_time: skipped,
    sales_roles: results.reduce((n, r) => n + r.sales, 0),
    failed: results.filter((r) => r.error).length,
    repaired: results.filter((r) => r.repaired_to).length,
    duration_ms: Date.now() - started,
  };
  await svc.from("collect_runs").insert({ summary, results: results.sort((a, b) => b.sales - a.sales) });
  return { ...summary, results };
}

const STALE_AFTER_DAYS = 4;

/**
 * Collects sales roles from the free multi-company feeds and stores them as shared roles.
 * Roles a feed stops listing are closed once they have not been seen for a few days.
 */
export async function runAggregators() {
  const svc = serviceClient();
  const { jobs, report } = await fetchAggregators();
  const now = new Date().toISOString();
  const rows = jobs
    .filter((j) => !isExcludedCompany(j.company, j.raw.url))
    .map((j) => ({ ...normalise(j.raw, j.company), source_type: "public" as const, company_name: j.company, source: j.raw.board, added_by: null, last_checked_at: now, is_active: true }));
  const unique = [...new Map(rows.map((r) => [r.dedupe_hash, r])).values()];
  let saved = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await svc.from("jobs").upsert(unique.slice(i, i + 100), { onConflict: "dedupe_hash", ignoreDuplicates: false });
    if (error) report.push({ feed: "save", fetched: 0, sales: 0, error: error.message }); else saved += Math.min(100, unique.length - i);
  }
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 864e5).toISOString();
  await svc.from("jobs").update({ is_active: false }).in("source", ["remotive", "arbeitnow", "adzuna"]).is("added_by", null).eq("is_active", true).lt("last_checked_at", cutoff);
  return { saved, report };
}
