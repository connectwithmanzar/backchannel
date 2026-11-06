// Raw fetchers for each ATS public API — no filtering or saving here.

export interface RawJob {
  external_id: string;
  title: string;
  location: string;
  url: string;
  description: string;
  posted_at: string | null;
  board: string;
  // Ashby may supply structured pay
  currency?: string;
  base_min?: number;
  base_max?: number;
  ote_min?: number;
  ote_max?: number;
  pay_verified?: boolean;
}

// ── Greenhouse ─────────────────────────────────────────────────────────────
export async function fetchGreenhouse(slug: string): Promise<RawJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs ?? []).map(
    (j: { id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; updated_at?: string }) => ({
      external_id: String(j.id),
      title: j.title ?? "",
      location: j.location?.name ?? "",
      url: j.absolute_url ?? "",
      description: j.content ?? "",
      posted_at: j.updated_at ?? null,
      board: "greenhouse",
    })
  );
}

// ── Lever ──────────────────────────────────────────────────────────────────
export async function fetchLever(slug: string): Promise<RawJob[]> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map(
    (p: { id: string; text: string; categories?: { location?: string }; hostedUrl?: string; descriptionBody?: string; createdAt?: number }) => ({
      external_id: p.id,
      title: p.text ?? "",
      location: p.categories?.location ?? "",
      url: p.hostedUrl ?? "",
      description: p.descriptionBody ?? "",
      posted_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      board: "lever",
    })
  );
}

// ── Ashby ──────────────────────────────────────────────────────────────────
interface AshbyCompensation {
  minValue?: number;
  maxValue?: number;
  currency?: string;
  interval?: string;
}

export async function fetchAshby(slug: string): Promise<RawJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobPostings ?? []).map(
    (j: { id: string; title: string; location?: string; jobUrl?: string; descriptionHtml?: string; publishedDate?: string; compensation?: AshbyCompensation }) => {
      const c: AshbyCompensation = j.compensation ?? {};
      const isAnnual = !c.interval || c.interval.toLowerCase().includes("year");
      return {
        external_id: j.id,
        title: j.title ?? "",
        location: j.location ?? "",
        url: j.jobUrl ?? "",
        description: j.descriptionHtml ?? "",
        posted_at: j.publishedDate ? new Date(j.publishedDate).toISOString() : null,
        board: "ashby",
        currency: c.currency ?? undefined,
        base_min: c.minValue && isAnnual ? c.minValue : undefined,
        base_max: c.maxValue && isAnnual ? c.maxValue : undefined,
        pay_verified: !!(c.minValue || c.maxValue),
      };
    }
  );
}

// ── SmartRecruiters ────────────────────────────────────────────────────────
export async function fetchSmartRecruiters(slug: string): Promise<RawJob[]> {
  const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.content ?? []).map(
    (j: { id: string; name: string; location?: { city?: string; country?: string; remote?: boolean }; releasedDate?: string; jobAd?: { sections?: { jobDescription?: { text?: string } } } }) => ({
      external_id: j.id,
      title: j.name ?? "",
      location: [j.location?.city, j.location?.country].filter(Boolean).join(", "),
      url: `https://careers.smartrecruiters.com/${slug}/${j.id}`,
      description: j.jobAd?.sections?.jobDescription?.text ?? "",
      posted_at: j.releasedDate ?? null,
      board: "smartrecruiters",
    })
  );
}
