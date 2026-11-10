import { cleanDomain } from "@/lib/contacts/apollo";

export interface ImportRow { name: string; domain: string | null }

export const MAX_IMPORT_ROWS = 300;
export const IMPORT_BATCH = 20;

/** Spreadsheet formulas start with = + - @, which are stripped so a pasted cell can never run as one. */
const defuse = (s: string) => s.replace(/^[=+\-@\t\r]+/, "").trim();

/** Splits a line on a tab, comma or semicolon, ignoring commas inside double quotes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && (ch === "," || ch === "\t" || ch === ";")) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const looksLikeHeader = (cells: string[]) => cells.some((c) => /^(company|name|website|domain|url|site)$/i.test(c));

/**
 * One company per line: "Acme, acme.com", "Acme<tab>https://www.acme.com", or just "Acme".
 * A header row is skipped. Duplicates (same name or website) are dropped. At most MAX_IMPORT_ROWS are kept.
 */
export function parseCompanyList(text: string): { rows: ImportRow[]; skipped: number } {
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  let skipped = 0;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = splitLine(line);
    if (i === 0 && looksLikeHeader(cells)) return;
    const urlCell = cells.slice(1).find((c) => cleanDomain(c)) ?? (cells.length === 1 && cleanDomain(cells[0]) ? cells[0] : "");
    const domain = urlCell ? cleanDomain(urlCell) : null;
    let name = defuse(cells[0] ?? "").slice(0, 120);
    if (!name || (cells.length === 1 && domain)) name = domain ? domain.split(".")[0].replace(/^./, (c) => c.toUpperCase()) : name;
    if (!name) { skipped++; return; }
    const key = domain ?? name.toLowerCase();
    if (seen.has(key) || seen.has(name.toLowerCase())) { skipped++; return; }
    seen.add(key); seen.add(name.toLowerCase());
    if (rows.length >= MAX_IMPORT_ROWS) { skipped++; return; }
    rows.push({ name, domain });
  });
  return { rows, skipped };
}

export function chunk<T>(items: T[], size = IMPORT_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
