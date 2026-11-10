// Job-alert emails from LinkedIn, Naukri, Instahyre, Wellfound, Bayt, Indeed and similar boards are sent to you, so reading
// one you paste is allowed. We keep the title, company, place and the link in the email, and send you there to apply.
import { canonicalUrl } from "@/lib/jobs/url";

export interface AlertListing { title: string; company: string; location: string; url: string }

const MAX_LISTINGS = 30;

/** The links in the email's pasted HTML, written next to their visible text so a plain-text paste keeps them. */
export function htmlToTextWithLinks(html: string): string {
  return html
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => `${inner.replace(/<[^>]+>/g, " ").trim()} (${href})`)
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/**
 * Keeps only listings the email really contains: an https link that appears in the pasted text, a title and a company.
 * Duplicates by address are dropped. Anything the AI invented fails the link check.
 */
export function validAlertListings(rows: unknown, pasted: string): AlertListing[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: AlertListing[] = [];
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const title = s(o.title, 200), company = s(o.company, 200), location = s(o.location, 200), link = s(o.url, 1000);
    if (!title || !company || !/^https:\/\//.test(link) || !pasted.includes(link)) continue;
    const url = canonicalUrl(link);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title, company, location: location || "Not stated", url });
    if (out.length >= MAX_LISTINGS) break;
  }
  return out;
}
