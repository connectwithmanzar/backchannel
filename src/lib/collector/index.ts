import { fetchCompany } from "./fetchers";
import { dedupe, normalize } from "./normalize";
import type { Job, SeedCompany } from "./types";

export interface CollectResult {
  jobs: Job[];
  report: { company: string; ats: string; total: number; sales: number; error?: string }[];
}

/** Pulls every seed company's public job feed and keeps the sales roles. */
export async function collect(seed: SeedCompany[], concurrency = 6): Promise<CollectResult> {
  const report: CollectResult["report"] = [];
  const all: Job[] = [];
  const queue = [...seed];
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const raw = await fetchCompany(c);
        const sales = raw.map((r) => normalize(r)).filter((j): j is Job => j !== null);
        all.push(...sales);
        report.push({ company: c.name, ats: c.ats, total: raw.length, sales: sales.length });
      } catch (e) {
        report.push({ company: c.name, ats: c.ats, total: 0, sales: 0, error: (e as Error).message });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { jobs: dedupe(all), report: report.sort((a, b) => b.sales - a.sales) };
}

export * from "./types";
export { normalize, parsePay, roleFamily, market, remoteType, visa } from "./normalize";
