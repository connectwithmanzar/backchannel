import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSteps, progressOf, type SetupFacts } from "../src/lib/onboarding";

const empty: SetupFacts = { hasCv: false, targetTitles: 0, markets: 0, hasPayFloor: false, savedAnswers: 0, gmailConnected: false, autoApplyMode: "off", applicationCount: 0 };

test("a new user has nothing done and starts with the CV", () => {
  const p = progressOf(buildSteps(empty));
  assert.equal(p.done, 0);
  assert.equal(p.percent, 0);
  assert.equal(p.ready, false);
  assert.equal(p.next?.id, "cv");
});

test("roles need both a title and a market", () => {
  const steps = buildSteps({ ...empty, hasCv: true, targetTitles: 2, markets: 0 });
  assert.equal(steps.find((s) => s.id === "roles")?.done, false);
  assert.equal(progressOf(steps).next?.id, "roles");
  assert.equal(buildSteps({ ...empty, targetTitles: 1, markets: 1 }).find((s) => s.id === "roles")?.done, true);
});

test("required steps come before optional ones when choosing what is next", () => {
  const f: SetupFacts = { ...empty, hasCv: true, targetTitles: 1, markets: 1 };
  assert.equal(progressOf(buildSteps(f)).next?.id, "answers");
});

test("ready means every required step is done, even with optional ones left", () => {
  const f: SetupFacts = { ...empty, hasCv: true, targetTitles: 1, markets: 1, savedAnswers: 3 };
  const p = progressOf(buildSteps(f));
  assert.equal(p.ready, true);
  assert.equal(p.next?.id, "pay");
  assert.ok(p.percent < 100);
});

test("auto-apply counts as done in practice mode and send mode, not when off", () => {
  assert.equal(buildSteps({ ...empty, autoApplyMode: "dry_run" }).find((s) => s.id === "auto")?.done, true);
  assert.equal(buildSteps({ ...empty, autoApplyMode: "submit" }).find((s) => s.id === "auto")?.done, true);
  assert.equal(buildSteps(empty).find((s) => s.id === "auto")?.done, false);
});

test("everything done gives 100 percent and no next step", () => {
  const all: SetupFacts = { hasCv: true, targetTitles: 1, markets: 1, hasPayFloor: true, savedAnswers: 1, gmailConnected: true, autoApplyMode: "submit", applicationCount: 1 };
  const p = progressOf(buildSteps(all));
  assert.equal(p.percent, 100);
  assert.equal(p.next, null);
});
