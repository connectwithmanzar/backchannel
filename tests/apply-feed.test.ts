import { test } from "node:test";
import assert from "node:assert/strict";
import { pollDelayMs, toFeed, type FeedRow } from "../src/lib/apply-feed";

const row = (o: Partial<FeedRow>): FeedRow => ({ id: "x", title: "AE", company: "Acme", status: "awaiting_approval", stage: "applied", auto_status: null, auto_log: null, updated_at: "2026-11-13T10:00:00Z", auto_at: null, ...o });

test("newest first, using the robot time when there is one", () => {
  const out = toFeed([row({ id: "old", updated_at: "2026-11-12T10:00:00Z" }), row({ id: "new", updated_at: "2026-11-13T10:00:00Z" }), row({ id: "robot", updated_at: "2026-11-01T00:00:00Z", auto_at: "2026-11-13T12:00:00Z", auto_status: "running" })]);
  assert.deepEqual(out.map((i) => i.id), ["robot", "new", "old"]);
});

test("only queued, running or filled applications are active", () => {
  const out = toFeed([row({ id: "a", auto_status: "running" }), row({ id: "b", auto_status: "submitted", status: "submitted" }), row({ id: "c" })]);
  assert.deepEqual(out.map((i) => [i.id, i.active]).sort(), [["a", true], ["b", false], ["c", false]]);
});

test("only the last four steps of the log are kept, trimmed", () => {
  const log = ["one", "two", "three", "four", "five", "  six  "].join("\n");
  const [item] = toFeed([row({ auto_log: log })]);
  assert.deepEqual(item.steps, ["three", "four", "five", "six"]);
});

test("the list is limited", () => {
  const rows = Array.from({ length: 30 }, (_, i) => row({ id: String(i) }));
  assert.equal(toFeed(rows, 20).length, 20);
});

test("polling is quick while the robot is busy and slow otherwise", () => {
  assert.equal(pollDelayMs(toFeed([row({ auto_status: "queued" })])), 5000);
  assert.equal(pollDelayMs(toFeed([row({})])), 30000);
  assert.equal(pollDelayMs([]), 30000);
});
