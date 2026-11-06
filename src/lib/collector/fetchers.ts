import type { RawJob, SeedCompany } from "./types";

const UA = "Backchannel job collector (personal use)";

export function htmlToText(html = ""): string {
  return html
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseGreenhouse(c: SeedCompany, data: any): RawJob[] {
  return (data?.jobs ?? []).map((j: any) => ({
    company: c.name, ats: "greenhouse", externalId: String(j.id), title: j.title,
    location: j.location?.name ?? "", url: j.absolute_url, postedAt: j.updated_at ?? j.first_published,
    description: htmlToText(j.content ?? ""),
  }));
}

export function parseLever(c: SeedCompany, data: any): RawJob[] {
  return (Array.isArray(data) ? data : []).map((j: any) => ({
    company: c.name, ats: "lever", externalId: j.id, title: j.text,
    location: j.categories?.location ?? (j.categories?.allLocations ?? []).join(", "), url: j.hostedUrl,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join("\n"),
    compensationText: j.salaryRange ? `${j.salaryRange.currency} ${j.salaryRange.min} - ${j.salaryRange.max}` : undefined,
    remoteFlag: j.workplaceType === "remote",
  }));
}

export function parseAshby(c: SeedCompany, data: any): RawJob[] {
  return (data?.jobs ?? []).filter((j: any) => j.isListed !== false).map((j: any) => ({
    company: c.name, ats: "ashby", externalId: j.id, title: j.title,
    location: [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)].filter(Boolean).join(", "),
    url: j.jobUrl, postedAt: j.publishedAt,
    description: j.descriptionPlain ?? htmlToText(j.descriptionHtml),
    compensationText: j.compensation?.compensationTierSummary ?? j.compensation?.scrapeableCompensationSalarySummary,
    remoteFlag: j.isRemote === true,
  }));
}

export function parseSmartRecruiters(c: SeedCompany, data: any): RawJob[] {
  return (data?.content ?? []).map((j: any) => ({
    company: c.name, ats: "smartrecruiters", externalId: j.id, title: j.name,
    location: [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(", "),
    url: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`, postedAt: j.releasedDate,
    description: "", remoteFlag: j.location?.remote === true,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchCompany(c: SeedCompany): Promise<RawJob[]> {
  switch (c.ats) {
    case "greenhouse":
      return parseGreenhouse(c, await getJson(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`));
    case "lever":
      return parseLever(c, await getJson(`https://api.lever.co/v0/postings/${c.slug}?mode=json`));
    case "ashby":
      return parseAshby(c, await getJson(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`));
    case "smartrecruiters":
      return parseSmartRecruiters(c, await getJson(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100`));
  }
}
