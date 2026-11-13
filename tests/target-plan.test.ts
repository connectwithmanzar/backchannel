import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanStrategy, cleanSteps, planOf, stepsFor } from "../src/lib/target-plan";

test("each strategy has its own order, and apply is last unless you apply now", () => {
  assert.deepEqual(stepsFor("referral_first"), ["research", "referral", "linkedin", "email", "apply"]);
  assert.deepEqual(stepsFor("outreach_first"), ["research", "email", "linkedin", "apply"]);
  assert.deepEqual(stepsFor("apply_now"), ["apply", "linkedin", "email"]);
});

test("unknown strategies and broken stored steps fall back safely", () => {
  assert.equal(cleanStrategy("nonsense"), "referral_first");
  assert.equal(cleanStrategy("apply_now"), "apply_now");
  assert.deepEqual(cleanSteps(null), { research: false, referral: false, email: false, linkedin: false, apply: false });
  assert.equal(cleanSteps({ research: "yes", email: true }).email, true);
  assert.equal(cleanSteps({ research: "yes" }).research, false);
});

test("a new target starts at research with nothing done", () => {
  const p = planOf("referral_first", {});
  assert.equal(p.done, 0);
  assert.equal(p.next, "research");
  assert.equal(p.percent, 0);
  assert.equal(p.readyToApply, false);
});

test("progress follows the steps of the chosen strategy only", () => {
  const p = planOf("outreach_first", { research: true, referral: true, email: true });
  assert.equal(p.total, 4);
  assert.equal(p.done, 2); // referral is not part of this plan
  assert.equal(p.next, "linkedin");
});

test("ready to apply when everything before apply is done", () => {
  const p = planOf("referral_first", { research: true, referral: true, linkedin: true, email: true });
  assert.equal(p.readyToApply, true);
  assert.equal(p.next, "apply");
  assert.equal(planOf("referral_first", { research: true, referral: true, linkedin: true, email: true, apply: true }).readyToApply, false);
  assert.equal(planOf("apply_now", {}).readyToApply, false);
});
