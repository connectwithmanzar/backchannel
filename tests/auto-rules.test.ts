import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRules, cleanRules, DEFAULT_RULES, isWeekendIst, type JobFacts } from "../src/lib/auto-rules";

const job = (o: Partial<JobFacts> = {}): JobFacts => ({ company: "Acme Corp", score: 80, payMax: null, currency: null, ...o });
const MON = new Date("2026-11-09T06:00:00Z");
const SAT = new Date("2026-11-14T06:00:00Z");

test("no rules means everything passes", () => {
  assert.deepEqual(checkRules(job(), DEFAULT_RULES, SAT), { ok: true });
});

test("bad or missing stored input becomes safe defaults", () => {
  assert.deepEqual(cleanRules(null), DEFAULT_RULES);
  assert.deepEqual(cleanRules("x"), DEFAULT_RULES);
  const r = cleanRules({ minScore: 500, minPayLpa: -3, blockedCompanies: " Acme, , Acme\nGlobex ", pauseWeekends: "yes" });
  assert.equal(r.minScore, 100);
  assert.equal(r.minPayLpa, 0);
  assert.deepEqual(r.blockedCompanies, ["Acme", "Globex"]);
  assert.equal(r.pauseWeekends, false);
});

test("weekends are judged in India time", () => {
  assert.equal(isWeekendIst(SAT), true);
  assert.equal(isWeekendIst(MON), false);
  // Friday 20:00 UTC is already Saturday 01:30 in India
  assert.equal(isWeekendIst(new Date("2026-11-13T20:00:00Z")), true);
});

test("weekend pause blocks on Saturday and not on Monday", () => {
  const rules = cleanRules({ pauseWeekends: true });
  assert.equal(checkRules(job(), rules, SAT).ok, false);
  assert.equal(checkRules(job(), rules, MON).ok, true);
});

test("a blocked company is matched by whole name, not by a lucky substring", () => {
  const rules = cleanRules({ blockedCompanies: ["Acme"] });
  assert.equal(checkRules(job({ company: "Acme Corp" }), rules, MON).ok, false);
  assert.equal(checkRules(job({ company: "ACME" }), rules, MON).ok, false);
  assert.equal(checkRules(job({ company: "Pacmeter" }), rules, MON).ok, true);
});

test("minimum score blocks lower scores and lets unknown scores through", () => {
  const rules = cleanRules({ minScore: 70 });
  const low = checkRules(job({ score: 60 }), rules, MON);
  assert.equal(low.ok, false);
  assert.match(low.ok ? "" : low.reason, /below your minimum of 70/);
  assert.equal(checkRules(job({ score: 70 }), rules, MON).ok, true);
  assert.equal(checkRules(job({ score: null }), rules, MON).ok, true);
});

test("pay floor only judges a stated yearly INR figure", () => {
  const rules = cleanRules({ minPayLpa: 12 });
  assert.equal(checkRules(job({ currency: "INR", payMax: 800000 }), rules, MON).ok, false);
  assert.equal(checkRules(job({ currency: "INR", payMax: 1500000 }), rules, MON).ok, true);
  assert.equal(checkRules(job({ currency: "USD", payMax: 50000 }), rules, MON).ok, true);
  assert.equal(checkRules(job({ currency: "INR", payMax: null }), rules, MON).ok, true);
});
