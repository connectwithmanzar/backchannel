// Reads a company list exported from Clay (or any sheet with the same columns) and prepares it for import.
import { cleanDomain } from "@/lib/contacts/apollo";

export type HiringSignal = "yes" | "unclear" | "no";
export type CompanyType = "B2B" | "B2B2C" | "B2C" | "Unclear";

export interface CompanyExtra {
  country: string | null; hq: string | null; size: string | null; sector: string | null;
  linkedin_url: string | null; company_type: CompanyType | null; hiring_signal: HiringSignal | null; linkedin_openings: number | null;
}

export interface ClayCompany { name: string; domain: string | null; extra: CompanyExtra }

/** A minimal CSV reader: quoted cells may hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const HIRING: HiringSignal[] = ["yes", "unclear", "no"];
const TYPES: CompanyType[] = ["B2B", "B2B2C", "B2C", "Unclear"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/^[=+\-@\t\r]+/, "").trim().slice(0, max) : "");

/** Checks every enrichment field so a request can never store anything unexpected. */
export function cleanExtra(raw: unknown): CompanyExtra {
  const o = (raw ?? {}) as Record<string, unknown>;
  const linkedin = text(o.linkedin_url, 300);
  const n = Number(o.linkedin_openings);
  return {
    country: text(o.country, 60) || null, hq: text(o.hq, 100) || null, size: text(o.size, 30) || null, sector: text(o.sector, 100) || null,
    linkedin_url: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\//i.test(linkedin) ? linkedin : null,
    company_type: TYPES.find((t) => t === o.company_type) ?? null,
    hiring_signal: HIRING.find((h) => h === o.hiring_signal) ?? null,
    linkedin_openings: Number.isFinite(n) && n >= 0 ? Math.round(n) : null,
  };
}

/** Null when the file does not look like a Clay company export. */
export function parseClayCsv(csv: string): ClayCompany[] | null {
  const table = parseCsv(csv);
  // Clay puts the table name in the first cell of the header row, so find the row that holds "Name" and "Domain".
  const at = table.findIndex((r) => r.some((c) => c.trim() === "Name") && r.some((c) => c.trim() === "Domain"));
  if (at < 0) return null;
  const head = table[at].map((c) => c.trim());
  const col = (n: string) => head.indexOf(n);
  const get = (r: string[], n: string) => (col(n) >= 0 ? (r[col(n)] ?? "").trim() : "");
  const seen = new Set<string>();
  const out: ClayCompany[] = [];
  for (const r of table.slice(at + 1)) {
    const name = text(get(r, "Use AI Company Name") || get(r, "Name"), 120);
    const domain = get(r, "Domain") ? cleanDomain(get(r, "Domain")) : null;
    if (!name) continue;
    const key = domain ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name, domain,
      extra: cleanExtra({
        country: get(r, "Country"), hq: [get(r, "City"), get(r, "State or Province")].filter(Boolean).join(", "), size: get(r, "Size"),
        sector: get(r, "Industry"), linkedin_url: get(r, "LinkedIn URL"), company_type: get(r, "Classification"),
        hiring_signal: get(r, "Is Hiring").toLowerCase(), linkedin_openings: get(r, "Job Openings"),
      }),
    });
  }
  return out;
}

export interface ClayFilter { countries: string[]; hiring: "yes" | "yes_unclear"; b2bOnly: boolean }

const HIRING_RANK: Record<string, number> = { yes: 0, unclear: 1 };

/** Applies the owner's filters and puts the best targets first: hiring, then B2B, then larger LinkedIn opening counts. */
export function selectClay(rows: ClayCompany[], f: ClayFilter): ClayCompany[] {
  return rows
    .filter((c) => (f.countries.length === 0 || (c.extra.country !== null && f.countries.includes(c.extra.country))))
    .filter((c) => c.extra.hiring_signal === "yes" || (f.hiring === "yes_unclear" && c.extra.hiring_signal !== "no"))
    .filter((c) => !f.b2bOnly || c.extra.company_type === "B2B" || c.extra.company_type === "B2B2C")
    .sort((a, b) =>
      (HIRING_RANK[a.extra.hiring_signal ?? ""] ?? 2) - (HIRING_RANK[b.extra.hiring_signal ?? ""] ?? 2) ||
      Number(b.extra.company_type === "B2B") - Number(a.extra.company_type === "B2B") ||
      (b.extra.linkedin_openings ?? 0) - (a.extra.linkedin_openings ?? 0));
}

export function countryCounts(rows: ClayCompany[]): [string, number][] {
  const m = new Map<string, number>();
  for (const c of rows) if (c.extra.country) m.set(c.extra.country, (m.get(c.extra.country) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
