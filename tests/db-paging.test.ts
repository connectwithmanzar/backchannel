import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, DB_PAGE } from "../src/lib/db-paging";

// A fake table that, like the real database, never returns more than 1,000 rows per request.
const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const source = (rows: { id: number }[], calls: number[][] = []) => async (from: number, to: number) => {
  calls.push([from, to]);
  return { data: rows.slice(from, Math.min(to + 1, from + DB_PAGE)), error: null };
};

test("reads every page of a table bigger than one page", async () => {
  const calls: number[][] = [];
  const r = await fetchAllRows(source(table(2500), calls));
  assert.equal(r.data.length, 2500);
  assert.equal(r.error, null);
  assert.equal(r.truncated, false);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(new Set(r.data.map((x) => x.id)).size, 2500);          // nothing repeated or skipped
});

test("a table that is exactly one page full still asks for the next page", async () => {
  const calls: number[][] = [];
  const r = await fetchAllRows(source(table(1000), calls));
  assert.equal(r.data.length, 1000);
  assert.equal(calls.length, 2);
});

test("a small or empty table is one request", async () => {
  const calls: number[][] = [];
  assert.equal((await fetchAllRows(source(table(7), calls))).data.length, 7);
  assert.equal(calls.length, 1);
  assert.deepEqual((await fetchAllRows(async () => ({ data: null, error: null }))).data, []);
});

test("an error keeps what was read so far and says what went wrong", async () => {
  let n = 0;
  const r = await fetchAllRows(async () => (n++ === 0 ? { data: table(DB_PAGE), error: null } : { data: null, error: { message: "boom" } }));
  assert.equal(r.data.length, DB_PAGE);
  assert.equal(r.error, "boom");
});

test("stops at the row cap and says it was cut short", async () => {
  const r = await fetchAllRows(source(table(5000)), 3000);
  assert.equal(r.data.length, 3000);
  assert.equal(r.truncated, true);
});
