// A tiny in-memory stand-in for the Supabase client, enough to test the send logic without a database.
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private action: "select" | "update" | "insert" | "delete" = "select";
  private patch: Row = {};
  private wantRows = false;
  private max = Infinity;
  private single = false;
  constructor(private rows: Row[]) {}

  select() { this.wantRows = true; return this; }
  update(patch: Row) { this.action = "update"; this.patch = patch; return this; }
  insert(row: Row | Row[]) { this.action = "insert"; for (const r of Array.isArray(row) ? row : [row]) this.rows.push({ id: `id${this.rows.length + 1}`, ...r }); return this; }
  delete() { this.action = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, _op: string, v: null) { this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c] ?? "") >= v); return this; }
  lt(c: string, v: number) { this.filters.push((r) => Number(r[c]) < v); return this; }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.single = true; return this; }

  private run() {
    const hit = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.action === "update") for (const r of hit) Object.assign(r, this.patch);
    if (this.action === "delete") for (const r of hit) this.rows.splice(this.rows.indexOf(r), 1);
    const out = this.action === "insert" ? [] : hit.slice(0, this.max);
    return { data: this.single ? (out[0] ?? null) : this.wantRows || this.action === "select" ? out : null, error: null as null };
  }
  then<R1 = { data: unknown; error: null }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> { return Promise.resolve(this.run()).then(onfulfilled, onrejected); }
}

export function fakeSupabase(tables: Record<string, Row[]>) {
  return { tables, from(name: string) { tables[name] ??= []; return new Query(tables[name]); } };
}
