import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { htmlToText } from "@/lib/collector/fetchers";

// Reads one job page from a link the owner pasted: the public page only, no login, one link at a time, like a link preview.
// Owner decision, 12 Nov 2026: this includes LinkedIn, Indeed and Google job links. When a site refuses, the fields that can
// be read from the link itself are still filled in, and the owner is told to paste the description.

export interface Listing {
  title: string | null;
  company: string | null;
  location: string | null;
  /** The job description and any pay line, as plain text. Empty when the page gave none. */
  text: string;
  /** Where each part came from, so the screen can say what is a guess from the link. */
  from: ("page-data" | "page-title" | "link" | "page-text")[];
  /** True when the site served a sign-in, captcha or error page instead of the job. */
  blocked: boolean;
}

// ---- Safety: never let a pasted link make the server read a private address -------------------------------------------
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0);
  }
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
  }
  return true; // not an address we understand: refuse
}

/** Throws a plain-words error unless the link is an https page on the public internet. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("That link doesn't look right."); }
  if (u.protocol !== "https:") throw new Error("Only https links are accepted.");
  if (u.username || u.password) throw new Error("Links with a login in them are not accepted.");
  if (u.port && u.port !== "443") throw new Error("That link uses an unusual port, so it was not opened.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && isIP(host) === 0) {
    throw new Error("That link points to a private address, so it was not opened.");
  }
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new Error("That link points to a private address, so it was not opened.");
    return u;
  }
  let addresses: { address: string }[];
  try { addresses = await lookup(host, { all: true }); } catch { throw new Error("Couldn't find that website."); }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("That link points to a private address, so it was not opened.");
  return u;
}

// ---- Reading the page -------------------------------------------------------------------------------------------------
const WALL = /(sign in to (view|see|continue)|join linkedin|log in to continue|verify (that )?you are (a )?human|are you a robot|access denied|just a moment|enable javascript and cookies|captcha|unusual traffic|request blocked|403 forbidden|page not found)/i;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const orNull = (s: string) => (s ? s : null);

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function jsonLdJobPosting(html: string): Json | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const queue: unknown[] = [];
  for (const b of blocks) { try { queue.push(JSON.parse(b.trim())); } catch { /* skip a block that is not valid JSON */ } }
  while (queue.length) {
    const v = queue.shift();
    if (Array.isArray(v)) { queue.push(...v); continue; }
    const o = asObj(v);
    if (!o) continue;
    const type = o["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return o;
    if (o["@graph"]) queue.push(o["@graph"]);
  }
  return null;
}

function placeOf(job: Json): string {
  const parts: string[] = [];
  const locs = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  for (const l of locs) {
    const a = asObj(asObj(l)?.address);
    if (!a) continue;
    const country = typeof a.addressCountry === "string" ? a.addressCountry : str(asObj(a.addressCountry)?.name);
    parts.push([str(a.addressLocality), str(a.addressRegion), country].map(clean).filter(Boolean).join(", "));
  }
  const place = parts.filter(Boolean)[0] ?? "";
  const remote = /telecommute/i.test(str(job.jobLocationType));
  const applicants = asObj(Array.isArray(job.applicantLocationRequirements) ? job.applicantLocationRequirements[0] : job.applicantLocationRequirements);
  if (remote) return place ? `Remote, ${place}` : applicants && str(applicants.name) ? `Remote, ${str(applicants.name)}` : "Remote";
  return place;
}

function payLine(job: Json): string {
  const salary = asObj(job.baseSalary);
  const value = asObj(salary?.value) ?? salary;
  if (!value) return "";
  const lo = value.minValue ?? value.value, hi = value.maxValue;
  const cur = str(salary?.currency) || str(value.currency);
  if (lo == null) return "";
  return `Pay: ${cur} ${lo}${hi != null && hi !== lo ? `-${hi}` : ""}${value.unitText ? ` per ${String(value.unitText).toLowerCase()}` : ""}`.replace(/\s+/g, " ");
}

function meta(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return clean(htmlToText(m?.[1] ?? ""));
}

/** LinkedIn job links carry the title and company in the address: /jobs/view/<title>-at-<company>-<id>. */
export function fromLinkUrl(link: string): { title: string | null; company: string | null } {
  let u: URL;
  try { u = new URL(link); } catch { return { title: null, company: null }; }
  const m = u.pathname.match(/\/jobs\/view\/([a-z0-9-]+?)-?(\d{6,})\/?$/i);
  if (!m || !/linkedin\./i.test(u.hostname)) return { title: null, company: null };
  const words = (s: string) => s.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  const [title, company] = m[1].split(/-at-(?!.*-at-)/);
  return { title: orNull(words(title)), company: company ? orNull(words(company)) : null };
}

/** The public (signed-out) LinkedIn job page has stable class names for the heading, company, place and description. */
function linkedinPublic(html: string): { title: string | null; company: string | null; location: string | null; text: string } {
  const grab = (re: RegExp) => clean(htmlToText(html.match(re)?.[1] ?? ""));
  const title = grab(/<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const company = grab(/class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || grab(/class="[^"]*top-card-layout__card[\s\S]*?topcard__flavor"[^>]*>([\s\S]*?)<\/span>/i);
  const location = grab(/class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const text = clean(htmlToText(html.match(/class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? ""));
  return { title: orNull(title), company: orNull(company), location: orNull(location), text };
}

/** "Senior Analyst at Kaseya" → { title: "Senior Analyst", company: "Kaseya" }, splitting on the last " at ". */
function splitAt(value: string): { title: string; company: string | null } {
  const i = value.lastIndexOf(" at ");
  return i > 0 ? { title: clean(value.slice(0, i)), company: orNull(clean(value.slice(i + 4).replace(/\s*\|.*$/, ""))) } : { title: clean(value), company: null };
}

/** Pulls what it can from a job page's HTML. Pure, so it can be tested without any network. */
export function extractListing(html: string, link: string): Listing {
  const from: Listing["from"] = [];
  const out: Listing = { title: null, company: null, location: null, text: "", from, blocked: false };

  const job = jsonLdJobPosting(html);
  if (job) {
    out.title = orNull(clean(str(job.title)));
    const org = job.hiringOrganization;
    out.company = orNull(clean(typeof org === "string" ? org : str(asObj(org)?.name)));
    out.location = orNull(placeOf(job));
    const desc = clean(htmlToText(str(job.description)));
    out.text = [desc, payLine(job)].filter(Boolean).join("\n\n");
    if (out.title || out.company || out.text) from.push("page-data");
  }

  const ogTitle = meta(html, "og:title") || clean(htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  // LinkedIn: "Acme hiring Sales Development Representative in Bengaluru, Karnataka, India | LinkedIn"
  const li = ogTitle.match(/^(.+?) hiring (.+?) in (.+?)(?: \| LinkedIn)?$/i);
  if (li) {
    out.company ??= orNull(clean(li[1]));
    out.title ??= orNull(clean(li[2]));
    out.location ??= orNull(clean(li[3]));
    from.push("page-title");
  } else if (ogTitle && !out.title && !WALL.test(ogTitle)) {
    out.title = orNull(clean(ogTitle.split(/\s[|–—-]\s/)[0]));
    from.push("page-title");
  }

  // LinkedIn's public page: use its own markup, then split "Title at Company" if the heading was all that was found.
  if (/linkedin\./i.test(new URL(link, "https://x.invalid").hostname)) {
    const lp = linkedinPublic(html);
    out.title = lp.title ?? out.title;
    out.company ??= lp.company;
    out.location ??= lp.location;
    if (!out.text && lp.text.length >= 80) { out.text = lp.text; from.push("page-data"); }
    if (out.title && !out.company) {
      const s = splitAt(out.title);
      if (s.company) { out.title = s.title; out.company = s.company; }
    }
  }

  const url = fromLinkUrl(link);
  if (url.title || url.company) {
    if (!out.title && url.title) { out.title = url.title; from.push("link"); }
    if (!out.company && url.company) { out.company = url.company; if (!from.includes("link")) from.push("link"); }
  }

  if (!out.text) {
    const description = meta(html, "og:description") || meta(html, "description");
    const visible = clean(htmlToText(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " "))).slice(0, 20_000);
    if (description.length >= 200 && !WALL.test(description)) { out.text = description; from.push("page-text"); }
    else if (visible.length >= 400 && !WALL.test(visible.slice(0, 1500))) { out.text = visible; from.push("page-text"); }
  }
  out.blocked = !out.text && (WALL.test(html.slice(0, 20_000)) || !job);
  out.text = out.text.slice(0, 20_000);
  return out;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Opens a public page (following up to four redirects, checking each one) and returns what the job looks like. */
export async function fetchListing(link: string): Promise<{ ok: true; listing: Listing } | { ok: false; reason: string; listing: Listing }> {
  const fromLink = fromLinkUrl(link);
  const empty: Listing = { title: fromLink.title, company: fromLink.company, location: null, text: "", from: fromLink.title || fromLink.company ? ["link"] : [], blocked: true };
  let current: URL;
  try { current = await assertPublicUrl(link); } catch (e) { return { ok: false, reason: (e as Error).message, listing: empty }; }

  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: BROWSER_HEADERS });
    } catch {
      return { ok: false, reason: "The site didn't answer in time.", listing: empty };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      try { current = await assertPublicUrl(new URL(res.headers.get("location") as string, current).toString()); } catch (e) { return { ok: false, reason: (e as Error).message, listing: empty }; }
      continue;
    }
    const html = res.ok || res.status === 999 ? (await res.text()).slice(0, 1_200_000) : "";
    if (!res.ok && !html) return { ok: false, reason: `The site refused the request (${res.status}).`, listing: empty };
    const listing = extractListing(html, link);
    // Keep what the link itself told us when the page gave less.
    listing.title ??= empty.title;
    listing.company ??= empty.company;
    if (!res.ok) listing.blocked = true;
    return { ok: true, listing };
  }
  return { ok: false, reason: "The link redirected too many times.", listing: empty };
}
