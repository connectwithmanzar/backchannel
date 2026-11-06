/**
 * Daily job collector.
 * Run: npm run collect
 * Reads data/seed-companies.json, pulls each company's public job board,
 * keeps sales roles, and writes data/jobs.json + data/collect-report.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collect, type SeedCompany } from "../src/lib/collector";

async function main() {
  const root = process.cwd();
  const seed: SeedCompany[] = JSON.parse(readFileSync(join(root, "data/seed-companies.json"), "utf8")).companies;
  console.log(`Checking ${seed.length} company job boards…`);
  const { jobs, report } = await collect(seed);
  writeFileSync(join(root, "data/jobs.json"), JSON.stringify({ collectedAt: new Date().toISOString(), jobs }, null, 2));
  writeFileSync(join(root, "data/collect-report.json"), JSON.stringify(report, null, 2));
  const failed = report.filter((r) => r.error);
  console.log(`\nFound ${jobs.length} sales roles.`);
  for (const r of report.filter((r) => !r.error && r.sales)) console.log(`  ${r.company.padEnd(16)} ${String(r.sales).padStart(3)} sales roles (of ${r.total})`);
  if (failed.length) {
    console.log(`\n${failed.length} board(s) could not be read. Check the slug in data/seed-companies.json:`);
    for (const r of failed) console.log(`  ${r.company} (${r.ats}): ${r.error}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
