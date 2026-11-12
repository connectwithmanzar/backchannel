// The database returns at most 1,000 rows per request, however large a limit is asked for, and it does not say so.
// A list that may grow past that has to be read in pages. This reads page after page until one comes back short.

export interface PageResult<T> { data: T[] | null; error: { message: string } | null }

export const DB_PAGE = 1000;

/**
 * build(from, to) runs one page of the query, usually `query.range(from, to)`. Give the query a stable order
 * (for example by id) so rows are not skipped or repeated between pages.
 * Stops after maxRows, so a runaway table cannot make a page slow forever.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows = 20_000,
): Promise<{ data: T[]; error: string | null; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += DB_PAGE) {
    const { data, error } = await build(from, from + DB_PAGE - 1);
    if (error) return { data: rows, error: error.message, truncated: false };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < DB_PAGE) return { data: rows, error: null, truncated: false };
  }
  return { data: rows, error: null, truncated: true };
}
