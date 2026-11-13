import { test } from "node:test";
import assert from "node:assert/strict";
import { swipeDecision, swipeProgress, tiltFor } from "../src/lib/swipe-gesture";

test("a short drag does nothing", () => {
  assert.equal(swipeDecision(60, 10), null);
  assert.equal(swipeDecision(0, 0), null);
});

test("right applies, left passes, up saves", () => {
  assert.equal(swipeDecision(150, 20), "apply");
  assert.equal(swipeDecision(-150, -20), "pass");
  assert.equal(swipeDecision(10, -140), "save");
});

test("the bigger movement wins on a diagonal", () => {
  assert.equal(swipeDecision(130, -120), "apply");
  assert.equal(swipeDecision(115, -200), "save");
});

test("dragging down never saves or applies", () => {
  assert.equal(swipeDecision(20, 200), null);
});

test("progress runs from 0 to 1 and tilt is capped", () => {
  assert.equal(swipeProgress(55, 0), 0.5);
  assert.equal(swipeProgress(500, 0), 1);
  assert.equal(swipeProgress(0, -55), 0.5);
  assert.equal(tiltFor(1000), 14);
  assert.equal(tiltFor(-1000), -14);
});
