// Remote-job boards that publish an open feed or API for reuse: Remote OK, We Work Remotely and Himalayas.
// We keep the title, company, place, date and the link back to the original listing, and send you there to apply.
// Remote OK asks that every listing links back to its page and names Remote OK as the source; the stored link does both.
import type { RawJob } from "@/lib/collectors/ats";

export interface OpenFeedJob { company: string; raw: RawJob }

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseRemoteOk(json: any): OpenFeedJob[] {
  const rows: any[] = Array.isArray(json) ? json : [];
  return rows.filter((j) => typeof j?.url === "string" && j.position).map((j) => ({
    company: String(j.company ?? "Unknown"),
    raw: {
      external_id: String(j.id ?? j.slug), title: String(j.position), url: String(j.url), board: "remoteok" as const, remote: true,
      location: `Remote${j.location ? ` · ${j.location}` : ""}`, description: String(j.description ?? ""),
      posted_at: j.date ? new Date(j.date).toISOString() : null,
    },
  }));
}

export function parseHimalayas(json: any): OpenFeedJob[] {
  const rows: any[] = Array.isArray(json?.jobs) ? json.jobs : [];
  return rows.filter((j) => typeof j?.applicationLink === "string" && j.title).map((j) => {
    const places: string[] = Array.isArray(j.locationRestrictions) ? j.locationRestrictions : [];
    const pubDate = Number(j.pubDate);
    return {
      company: String(j.companyName ?? "Unknown"),
      raw: {
        external_id: String(j.guid ?? j.applicationLink), title: String(j.title), url: String(j.applicationLink), board: "himalayas" as const, remote: true,
        location: `Remote · ${places.length ? places.join(", ") : "Worldwide"}`, description: String(j.description ?? j.excerpt ?? ""),
        posted_at: pubDate > 0 ? new Date(pubDate * 1000).toISOString() : null,
      },
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function unescapeXml(s: string): string {
  return s.replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unescapeXml(m[1]) : "";
}

/** We Work Remotely publishes RSS. Titles read "Company: Role". */
export function parseWeWorkRemotely(xml: string): OpenFeedJob[] {
  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).flatMap((item) => {
    const url = tag(item, "link");
    const full = tag(item, "title");
    if (!/^https:\/\//.test(url) || !full) return [];
    const i = full.indexOf(": ");
    const company = i > 0 ? full.slice(0, i) : "Unknown";
    const date = new Date(tag(item, "pubDate"));
    return [{
      company,
      raw: {
        external_id: tag(item, "guid") || url, title: i > 0 ? full.slice(i + 2) : full, url, board: "weworkremotely" as const, remote: true,
        location: `Remote · ${tag(item, "region") || "Anywhere"}`, description: tag(item, "description"),
        posted_at: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      },
    }];
  });
}

const HEADERS = { Accept: "application/json, application/xml", "User-Agent": "Backchannel job collector" };

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res;
}

export const OPEN_FEEDS: { feed: string; load: () => Promise<OpenFeedJob[]> }[] = [
  { feed: "remoteok", load: async () => parseRemoteOk(await (await get("https://remoteok.com/api")).json()) },
  { feed: "weworkremotely", load: async () => parseWeWorkRemotely(await (await get("https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss")).text()) },
  ...["sales development representative", "business development representative", "account executive"].map((q) => ({
    feed: `himalayas-${q.split(" ")[0]}`,
    load: async () => parseHimalayas(await (await get(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&limit=50`)).json()),
  })),
];
