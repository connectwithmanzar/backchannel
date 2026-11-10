// JSearch (on RapidAPI) is a licensed feed of Google-for-Jobs listings: real postings from many boards and company
// career sites, with the posting's source named. It needs a free or paid RapidAPI key in JSEARCH_API_KEY.
// We keep the title, employer, place, date, a short description and the link to apply, and send you there to apply.
import { isSalesRole } from "@/lib/jobs/process";

export interface ListingCard {
  id: string; title: string; company: string; location: string; url: string; source: string;
  postedAt: string | null; remote: boolean; snippet: string; pay: string | null;
}

export function jsearchConfigured(): boolean {
  return (process.env.JSEARCH_API_KEY ?? "").length > 10;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseJSearch(json: any): ListingCard[] {
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return rows.filter((j) => typeof j?.job_apply_link === "string" && /^https:\/\//.test(j.job_apply_link) && j.job_title).map((j) => {
    const place = [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ");
    const hasPay = Number(j.job_min_salary) > 0 && Number(j.job_max_salary) > 0;
    return {
      id: String(j.job_id ?? j.job_apply_link), title: String(j.job_title), company: String(j.employer_name ?? "Unknown"),
      location: place || (j.job_is_remote ? "Remote" : ""), url: String(j.job_apply_link), source: String(j.job_publisher ?? "Job listing"),
      postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc).toISOString() : null,
      remote: j.job_is_remote === true, snippet: String(j.job_description ?? "").replace(/\s+/g, " ").trim().slice(0, 4000),
      pay: hasPay ? `${j.job_salary_currency ?? ""} ${Math.round(j.job_min_salary)}-${Math.round(j.job_max_salary)} ${j.job_salary_period ? `per ${String(j.job_salary_period).toLowerCase()}` : ""}`.trim() : null,
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Listings that belong to the company asked about, and only sales-type roles; others are counted, not shown. */
export function listingsForCompany(cards: ListingCard[], company: string): { shown: ListingCard[]; hidden: number } {
  const key = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mine = cards.filter((c) => c.company.toLowerCase().replace(/[^a-z0-9]/g, "").includes(key));
  const shown = mine.filter((c) => isSalesRole(c.title));
  return { shown, hidden: mine.length - shown.length };
}

export async function searchJSearch(query: string, opts: { pages?: number; datePosted?: "all" | "month" | "week" } = {}): Promise<ListingCard[]> {
  const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=${opts.pages ?? 2}&date_posted=${opts.datePosted ?? "month"}`;
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": process.env.JSEARCH_API_KEY ?? "", "x-rapidapi-host": "jsearch.p.rapidapi.com" },
    signal: AbortSignal.timeout(20_000), cache: "no-store",
  });
  if (res.status === 429) throw new Error("The job listings quota for this month is used up.");
  if (res.status === 401 || res.status === 403) throw new Error("The job listings key was refused. Check JSEARCH_API_KEY.");
  if (!res.ok) throw new Error(`Job listings returned an error (${res.status}).`);
  return parseJSearch(await res.json());
}
