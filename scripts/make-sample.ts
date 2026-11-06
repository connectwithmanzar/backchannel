/** Builds data/sample-jobs.json from test fixtures so the Roles page works before the first real collect. */
import { readFileSync, writeFileSync } from "node:fs";
import { parseAshby, parseGreenhouse, parseLever } from "../src/lib/collector/fetchers";
import { normalize } from "../src/lib/collector/normalize";
const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, "utf8"));
const raw = [
  ...parseGreenhouse({ name: "Sample Co A", ats: "greenhouse", slug: "a" }, fx("greenhouse")),
  ...parseLever({ name: "Sample Co B", ats: "lever", slug: "b" }, fx("lever")),
  ...parseAshby({ name: "Sample Co C", ats: "ashby", slug: "c" }, fx("ashby")),
];
const jobs = raw.map((r) => normalize(r)).filter(Boolean);
writeFileSync("data/sample-jobs.json", JSON.stringify({ collectedAt: null, sample: true, jobs }, null, 2));
console.log(`Wrote ${jobs.length} sample jobs`);
