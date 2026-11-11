import type { RawJob } from "@/lib/collectors/ats";
import type { Job, RemoteType } from "@/lib/collector/types";
import { normalise } from "@/lib/jobs/process";
import { toMarket } from "@/lib/jobs/market";
import { toRoleFamily } from "@/lib/jobs/scoring";
import { buildSearchProfile, scoreJob } from "@/lib/score";
import { openToIndia } from "@/lib/role-filters";

export interface PreviewInput { url: string; title: string; company: string; location: string; remote?: boolean; text: string }

type ProfileRow = Parameters<typeof buildSearchProfile>[0];

/** Scores a page you are looking at, the same way a collected role is scored, without saving anything. */
export function previewScore(i: PreviewInput, profileRow: ProfileRow) {
  const raw: RawJob = { external_id: i.url, title: i.title, location: i.location, url: i.url, description: i.text, posted_at: null, board: "pasted" as RawJob["board"], remote: i.remote };
  const n = normalise(raw, i.company || "Unknown");
  const job: Job = {
    id: "preview", company: i.company || "Unknown", title: n.title, location: i.location, remoteType: n.remote_type as RemoteType,
    market: toMarket(n.market, n.remote_type, n.location), sourceType: "careers", board: "pasted", url: i.url, lastCheckedAt: new Date().toISOString(),
    currency: n.currency ?? undefined, payMin: n.ote_min ?? n.base_min ?? undefined, payMax: n.ote_max ?? n.base_max ?? undefined,
    payKind: n.ote_min != null || n.ote_max != null ? "ote" : "base", payBandStatus: n.pay_band_status === "verified" ? "verified" : "unknown",
    visaSponsorship: n.visa_sponsorship, roleFamily: toRoleFamily(n.title), description: n.description,
  };
  const r = scoreJob(job, buildSearchProfile(profileRow));
  return { score: r.score, parts: r.parts, explanation: r.explanation, roleFamily: job.roleFamily, openToIndia: openToIndia(i.location, n.remote_type) };
}
