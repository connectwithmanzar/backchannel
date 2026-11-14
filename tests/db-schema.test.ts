import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDbSchema } from "../src/lib/supabase/schema";

test("an unset or empty setting means public, so nothing changes until DB_SCHEMA is set", () => {
  assert.equal(resolveDbSchema(undefined), "public");
  assert.equal(resolveDbSchema(null), "public");
  assert.equal(resolveDbSchema("   "), "public");
});

test("a plain schema name is used as given, with spaces trimmed", () => {
  assert.equal(resolveDbSchema("backchannel"), "backchannel");
  assert.equal(resolveDbSchema(" rws "), "rws");
});

test("anything that is not a plain lowercase name is refused and falls back to public", () => {
  for (const bad of ["Back-Channel", "back channel", "public; drop table x", "1abc", "a".repeat(64), "backchannel\"", "../auth"]) {
    assert.equal(resolveDbSchema(bad), "public", bad);
  }
});
