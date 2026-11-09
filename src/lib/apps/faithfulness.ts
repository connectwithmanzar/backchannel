// A cheap check that a generated CV or cover note only uses numbers the candidate's own CV contains.
const NUMBER = /\$?\d[\d,]*(?:\.\d+)?(?:%|[kmx](?![a-z]))?/gi;

function normalise(s: string) {
  return s.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
}

/** Numbers in `output` (two digits or more, or with %, k, m, x) that appear nowhere in the source texts. */
export function unsupportedNumbers(output: string, sources: string[]): string[] {
  const haystack = normalise(sources.join("\n"));
  const found = new Set<string>();
  for (const m of output.match(NUMBER) ?? []) {
    const token = normalise(m).replace(/^\$/, "").trim();
    const digits = token.replace(/\D/g, "");
    if (digits.length < 2 && !/[%kmx]$/.test(token)) continue;
    if (!haystack.includes(token) && !haystack.includes(digits)) found.add(m.trim());
  }
  return [...found].slice(0, 8);
}
