import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLabel } from "../src/lib/match-label";

test("match labels step at 80, 65 and 50", () => {
  assert.equal(matchLabel(87), "Best match");
  assert.equal(matchLabel(80), "Best match");
  assert.equal(matchLabel(79), "Strong match");
  assert.equal(matchLabel(65), "Strong match");
  assert.equal(matchLabel(53), "Worth applying");
  assert.equal(matchLabel(49), "Stretch");
});
