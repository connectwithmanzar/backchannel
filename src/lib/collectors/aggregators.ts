// Free, licensed job feeds that cover many companies at once. Each one publishes its listings for reuse:
// Remotive and Arbeitnow need no key, Adzuna needs a free key (ADZUNA_APP_ID and ADZUNA_APP_KEY).
// We keep the title, company, place and the link back to the original listing, and send you there to apply.
import type { RawJob } from "@/lib/collectors/ats";
import { isSalesRole } from "@/lib/jobs/process";

export interface FeedJob { company: string; raw: RawJob }

const HEADERS = { Accept: "application/json", "User-Agent": "Backchannel job collector" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseRemotive(json: any): FeedJob[] {
  const rows: any[] = Array.isArray(json?.jobs) ? json.jobs : [];
  return rows.filter((j) => typeof j?.url === "string" && j.title).map((j) => ({
    company: String(j.company_name ?? "Unknown"),
    raw: {
      external_id: String(j.id), title: String(j.title), url: String(j.url), board: "remotive" as const, remote: true,
      location: `Remote · ${j.candidate_required_location || "Worldwide"}`,
      description: String(j.description ?? ""), posted_at: j.publication_date ? new Date(j.publication_date).toISOString() : null,
    },
  }));
}

export function parseArbeitnow(json: any): FeedJob[] {
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return rows.filter((j) => typeof j?.url === "string" && j.title).map((j) => ({
    company: String(j.company_name ?? "Unknown"),
    raw: {
      external_id: String(j.slug ?? j.url), title: String(j.title), url: String(j.url), board: "arbeitnow" as const, remote: j.remote === true,
      location: String(j.location ?? ""), description: String(j.description ?? ""),
      posted_at: typeof j.created_at === "number" ? new Date(j.created_at * 1000).toISOString() : null,
    },
  }));
}

export function parseAdzuna(json: any): FeedJob[] {
  const rows: any[] = Array.isArray(json?.results) ? json.results : [];
  return rows.filter((j) => typeof j?.redirect_url === "string" && j.title).map((j) => {
    const hasPay = Number(j.salary_min) > 0 && Number(j.salary_max) > 0 && j.salary_is_predicted !== "1" && j.salary_is_predicted !== 1;
    return {
      company: String(j.company?.display_name ?? "Unknown"),
      raw: {
        external_id: String(j.id), title: String(j.title).replace(/<\/?[^>]+>/g, ""), url: String(j.redirect_url), board: "adzuna" as const,
        location: String(j.location?.display_name ?? ""), description: String(j.description ?? ""), posted_at: j.created ? new Date(j.created).toISOString() : null,
        ...(hasPay ? { base_min: Number(j.salary_min), base_max: Number(j.salary_max), pay_verified: true } : {}),
      },
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json();
}

export const ADZUNA_COUNTRIES = [
  { code: "in", currency: "INR" }, { code: "gb", currency: "GBP" }, { code: "sg", currency: "SGD" }, { code: "nl", currency: "EUR" },
  { code: "de", currency: "EUR" }, { code: "ca", currency: "CAD" }, { code: "au", currency: "AUD" }, { code: "us", currency: "USD" },
];

export function adzunaConfigured(): boolean {
  return (process.env.ADZUNA_APP_ID ?? "").length > 3 && (process.env.ADZUNA_APP_KEY ?? "").length > 8;
}

export interface FeedReport { feed: string; fetched: number; sales: number; error?: string }

/** Pulls every configured feed, keeps only the sales roles, and reports each feed separately so one failure hides nothing. */
export async function fetchAggregators(): Promise<{ jobs: FeedJob[]; report: FeedReport[] }> {
  const jobs: FeedJob[] = [];
  const report: FeedReport[] = [];
  async function run(feed: string, load: () => Promise<FeedJob[]>, currency?: string) {
    try {
      const all = await load();
      const sales = all.filter((j) => isSalesRole(j.raw.title)).map((j) => (currency && j.raw.base_min ? { ...j, raw: { ...j.raw, currency } } : j));
      jobs.push(...sales);
      report.push({ feed, fetched: all.length, sales: sales.length });
    } catch (e) {
      report.push({ feed, fetched: 0, sales: 0, error: (e as Error).message });
    }
  }
  const tasks: Promise<void>[] = [
    run("remotive", async () => parseRemotive(await getJson("https://remotive.com/api/remote-jobs?category=sales-business&limit=200"))),
    run("arbeitnow", async () => parseArbeitnow(await getJson("https://www.arbeitnow.com/api/job-board-api"))),
  ];
  if (adzunaConfigured()) {
    const id = encodeURIComponent(process.env.ADZUNA_APP_ID ?? ""), key = encodeURIComponent(process.env.ADZUNA_APP_KEY ?? "");
    for (const c of ADZUNA_COUNTRIES) {
      tasks.push(run(`adzuna-${c.code}`, async () => {
        const url = `https://api.adzuna.com/v1/api/jobs/${c.code}/search/1?app_id=${id}&app_key=${key}&results_per_page=50&what_or=${encodeURIComponent("sales development representative business development representative sdr bdr")}&sort_by=date`;
        return parseAdzuna(await getJson(url));
      }, c.currency));
    }
  }
  await Promise.all(tasks);
  return { jobs, report };
}
