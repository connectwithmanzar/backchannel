// Fetchers for each ATS's public job-board API. They throw on errors so the
// collector can report exactly which company boards are broken.

import { fetchWorkday } from "@/lib/collectors/workday";

export type AtsType = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";

export interface RawJob {
  external_id: string;
  title: string;
  location: string;
  url: string;
  description: string;
  posted_at: string | null;
  board: AtsType | "remotive" | "arbeitnow" | "adzuna" | "jsearch" | "remoteok" | "weworkremotely" | "himalayas";
  remote?: boolean;
  currency?: string;
  base_min?: number;
  base_max?: number;
  pay_verified?: boolean;
}

const TIMEOUT_MS = 12_000;

export class BoardNotFound extends Error {}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Backchannel job collector" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 404) throw new BoardNotFound(`board not found (404)`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("timed out");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseGreenhouse(data: any): RawJob[] {
  return (data?.jobs ?? []).map((j: any) => ({
    external_id: String(j.id),
    title: j.title ?? "",
    location: j.location?.name ?? "",
    url: j.absolute_url ?? "",
    description: j.content ?? "",
    posted_at: j.first_published ?? j.updated_at ?? null,
    board: "greenhouse",
  }));
}

export function parseLever(data: any): RawJob[] {
  if (!Array.isArray(data)) return [];
  return data.map((p: any) => {
    const lists = (p.lists ?? []).map((l: any) => `${l.text ?? ""}\n${l.content ?? ""}`).join("\n");
    const sr = p.salaryRange;
    const annual = !sr?.interval || /year|annual/i.test(sr.interval);
    return {
      external_id: p.id,
      title: p.text ?? "",
      location: p.categories?.location ?? (p.categories?.allLocations ?? []).join(", "),
      url: p.hostedUrl ?? "",
      description: [p.description ?? p.descriptionPlain ?? "", lists, p.additional ?? p.additionalPlain ?? ""].join("\n"),
      posted_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      board: "lever",
      remote: p.workplaceType === "remote",
      currency: sr?.currency,
      base_min: sr?.min && annual ? sr.min : undefined,
      base_max: sr?.max && annual ? sr.max : undefined,
      pay_verified: !!(sr?.min && annual),
    };
  });
}

export function parseAshby(data: any): RawJob[] {
  const list = data?.jobs ?? data?.jobPostings ?? [];
  return list
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => {
      const comps: any[] = j.compensation?.summaryComponents ?? [];
      const salary = comps.find((c) => c.compensationType === "Salary" && (!c.interval || /YEAR/i.test(c.interval)));
      const locs = [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)].filter(Boolean);
      return {
        external_id: j.id,
        title: j.title ?? "",
        location: locs.join(", "),
        url: j.jobUrl ?? j.applyUrl ?? "",
        description: j.descriptionHtml ?? j.descriptionPlain ?? "",
        posted_at: j.publishedAt ?? j.publishedDate ?? null,
        board: "ashby",
        remote: j.isRemote === true,
        currency: salary?.currencyCode,
        base_min: salary?.minValue ?? undefined,
        base_max: salary?.maxValue ?? undefined,
        pay_verified: !!(salary?.minValue || salary?.maxValue),
      };
    });
}

export function parseSmartRecruiters(data: any, slug: string): RawJob[] {
  return (data?.content ?? []).map((j: any) => ({
    external_id: j.id,
    title: j.name ?? "",
    location: [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(", "),
    url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
    description: "",
    posted_at: j.releasedDate ?? null,
    board: "smartrecruiters",
    remote: j.location?.remote === true,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchBoard(ats: AtsType, slug: string): Promise<RawJob[]> {
  if (ats === "workday") return fetchWorkday(slug);
  const s = encodeURIComponent(slug);
  switch (ats) {
    case "greenhouse":
      return parseGreenhouse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`));
    case "lever":
      return parseLever(await getJson(`https://api.lever.co/v0/postings/${s}?mode=json`));
    case "ashby":
      return parseAshby(await getJson(`https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`));
    case "smartrecruiters":
      return parseSmartRecruiters(await getJson(`https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`), slug);
  }
}

/** Slug guesses for a company name/domain, e.g. "Apollo.io" → apolloio, apollo-io, apollo. */
export function slugCandidates(name: string, domain?: string | null): string[] {
  const base = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 .-]/g, "").trim();
  const words = base.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  const root = (domain ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
  const c = [
    words.join(""), words.join("-"), words[0], root,
    words.join("") + "hq", words.join("") + "inc", words.join("") + "labs",
  ].filter((x) => x && x.length > 1);
  return [...new Set(c)];
}

/**
 * Tries every ATS with every slug guess and returns the board with the most jobs.
 * Used to repair a broken company and to add new companies by name.
 */
export async function discoverBoard(
  name: string,
  domain?: string | null
): Promise<{ ats: AtsType; slug: string; jobs: number } | null> {
  const atsList: AtsType[] = ["greenhouse", "ashby", "lever", "smartrecruiters"];
  const tries = slugCandidates(name, domain).flatMap((slug) => atsList.map((ats) => ({ ats, slug })));
  const found = await Promise.all(
    tries.map(async ({ ats, slug }) => {
      try {
        const jobs = await fetchBoard(ats, slug);
        return jobs.length ? { ats, slug, jobs: jobs.length } : null;
      } catch {
        return null;
      }
    })
  );
  return found.filter((f): f is NonNullable<typeof f> => !!f).sort((a, b) => b.jobs - a.jobs)[0] ?? null;
}
