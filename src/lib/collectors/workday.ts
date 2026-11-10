// Workday publishes each company's open jobs through the same public search the careers page uses.
import type { RawJob } from "@/lib/collectors/ats";
import { isSalesRole } from "@/lib/jobs/process";
import { parseWorkdayList, splitWorkdaySlug, type WorkdayPosting } from "@/lib/collectors/workday-url";

const SEARCH_TERMS = ["sales", "business development", "account", "partner", "customer success"];
const PAGE = 20, PAGES = 2, MAX_ROLES = 40;

async function post(url: string, body: object): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Backchannel job collector" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (res.status === 404 || res.status === 422) throw new Error("board not found");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function detail(base: string, p: WorkdayPosting): Promise<{ description: string; posted: string | null; remote: boolean }> {
  try {
    const res = await fetch(`${base}${p.path}`, { headers: { Accept: "application/json", "User-Agent": "Backchannel job collector" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) return { description: "", posted: p.posted, remote: false };
    const info = ((await res.json()) as { jobPostingInfo?: { jobDescription?: string; startDate?: string; remoteType?: string } }).jobPostingInfo ?? {};
    return { description: info.jobDescription ?? "", posted: info.startDate ? new Date(info.startDate).toISOString() : p.posted, remote: /remote/i.test(info.remoteType ?? "") };
  } catch { return { description: "", posted: p.posted, remote: false }; }
}

/** Sales roles from one Workday board. Only roles whose title looks like sales get a second request for the full text. */
export async function fetchWorkday(slug: string): Promise<RawJob[]> {
  const w = splitWorkdaySlug(slug);
  if (!w) throw new Error("not a valid Workday board");
  const base = `https://${w.host}/wday/cxs/${w.tenant}/${w.site}`;
  const found = new Map<string, WorkdayPosting>();
  for (const term of SEARCH_TERMS) {
    for (let page = 0; page < PAGES; page++) {
      const rows = parseWorkdayList(await post(`${base}/jobs`, { appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText: term }));
      for (const r of rows) if (isSalesRole(r.title)) found.set(r.path, r);
      if (rows.length < PAGE) break;
    }
  }
  const postings = [...found.values()].slice(0, MAX_ROLES);
  const out: RawJob[] = [];
  const queue = [...postings];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const d = await detail(base, p);
      out.push({
        external_id: p.path, title: p.title, location: p.location, url: `https://${w.host}/en-US/${w.site}${p.path}`,
        description: d.description, posted_at: d.posted, board: "workday", remote: d.remote,
      });
    }
  }));
  return out;
}
