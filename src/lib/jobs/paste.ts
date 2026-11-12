import { htmlToText } from "@/lib/collector/fetchers";
import { dedupeHash, normalise, type NormalisedJob } from "@/lib/jobs/process";
import type { RawJob } from "@/lib/collectors/ats";

// `fetchable` marks the public career-page systems. Links the owner pastes are read by fetchListing (fetch-listing.ts) for any board,
// by his decision of 12 Nov 2026; this list only describes which sites need no special care.
const FETCHABLE_HOSTS = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", "jobs.smartrecruiters.com", "apply.workable.com"];

export type ParsedUrl = { ok: true; url: string; fetchable: boolean } | { ok: false; reason: string };

export function parseJobUrl(raw: string): ParsedUrl {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "That link doesn't look right." }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https links are accepted." };
  return { ok: true, url: u.toString(), fetchable: FETCHABLE_HOSTS.includes(u.hostname.toLowerCase()) };
}

export async function fetchJobPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Backchannel job saver (personal use)", Accept: "text/html" } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 600_000);
    const text = htmlToText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
    return text.length >= 200 ? text.slice(0, 20_000) : null;
  } catch {
    return null;
  }
}

export interface PastedFields { title: string; company: string; location: string }

export function buildPastedJob(userId: string, f: PastedFields, text: string, url: string | null): Omit<NormalisedJob, "source_type"> & { source_type: "public"; company_name: string; added_by: string; source: string; company_id: null } {
  const raw: RawJob = {
    external_id: dedupeHash(userId, f.title, url ?? f.company),
    title: f.title, location: f.location, url: url ?? "", description: text, posted_at: null, board: "pasted" as RawJob["board"],
  };
  const n = normalise(raw, f.company);
  return {
    ...n,
    source_type: "public",
    board: "pasted",
    // Per-user hash so two people pasting the same job don't collide on the global unique key.
    dedupe_hash: dedupeHash(`${userId}:${f.company}`, f.title, f.location),
    company_name: f.company, added_by: userId, source: "pasted", company_id: null,
  };
}
