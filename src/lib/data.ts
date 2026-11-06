import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Job } from "./collector/types";
import type { SearchProfile } from "./score";

/** Local-file data source. Build 2–4 move this to Supabase. */
export function loadJobs(): { jobs: Job[]; collectedAt: string | null; sample: boolean } {
  const real = join(process.cwd(), "data/jobs.json");
  const file = existsSync(real) ? real : join(process.cwd(), "data/sample-jobs.json");
  const d = JSON.parse(readFileSync(file, "utf8"));
  return { jobs: d.jobs, collectedAt: d.collectedAt ?? null, sample: file !== real };
}

export function loadProfile(): SearchProfile {
  return JSON.parse(readFileSync(join(process.cwd(), "data/profile.json"), "utf8"));
}
