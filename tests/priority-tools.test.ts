import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByTier, suggestCompanies, tierRank, type CompanyRow } from "../src/lib/company-list";
import { PRACTICE_QUESTIONS, questionById } from "../src/lib/practice-questions";
import { isMissingSchema } from "../src/lib/migration";
import { CV_FAMILIES, familyById } from "../src/lib/cv-versions";

const row = (o: Partial<CompanyRow>): CompanyRow => ({ id: "x", name: "X", domain: null, atsType: "lever", hasBoard: true, enabled: true, error: null, lastCheckedAt: null, roles: 0, inIndia: 0, newThisWeek: 0, country: null, size: null, sector: null, linkedinUrl: null, companyType: null, hiring: null, linkedinOpenings: null, status: null, note: "", watching: false, ...o });

test("tiers sort A, B, C, then no tier, with D last", () => {
  assert.ok(tierRank("A") > tierRank("B"));
  assert.ok(tierRank("B") > tierRank("C"));
  assert.ok(tierRank("C") > tierRank(null));
  assert.ok(tierRank(null) > tierRank("D"));
  assert.equal(tierRank(undefined), tierRank(null));
});

test("tier filter keeps only that tier", () => {
  const rows = [row({ id: "a", tier: "A" }), row({ id: "b", tier: "B" }), row({ id: "c", tier: null })];
  assert.deepEqual(filterByTier(rows, "A").map((r) => r.id), ["a"]);
  assert.deepEqual(filterByTier(rows, "any").map((r) => r.id), ["a", "b", "c"]);
});

test("suggestions: unwatched, no tier, new roles this week, busiest first, at most three", () => {
  const rows = [
    row({ id: "w", name: "Watched", watching: true, newThisWeek: 9 }),
    row({ id: "t", name: "Tiered", tier: "B", newThisWeek: 9 }),
    row({ id: "n", name: "Not for me", status: "not_for_me", newThisWeek: 9 }),
    row({ id: "q", name: "Quiet", newThisWeek: 0 }),
    row({ id: "1", name: "One", newThisWeek: 1 }),
    row({ id: "4", name: "Four", newThisWeek: 4, inIndia: 2 }),
    row({ id: "3", name: "Three", newThisWeek: 3 }),
    row({ id: "2", name: "Two", newThisWeek: 2 }),
  ];
  const out = suggestCompanies(rows);
  assert.deepEqual(out.map((s) => s.id), ["4", "3", "2"]);
  assert.equal(out[0].reason, "4 new sales roles this week, 2 in India.");
  assert.equal(suggestCompanies([row({ id: "s", newThisWeek: 1 })])[0].reason, "1 new sales role this week.");
});

test("practice questions: unique ids and none that answer salary, notice or visa for the user", () => {
  const ids = PRACTICE_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of PRACTICE_QUESTIONS) assert.doesNotMatch(q.text, /salary|notice period|visa|work authori[sz]ation|expected pay/i, q.id);
  assert.equal(questionById("gap")?.group, "About you");
  assert.equal(questionById("nope"), undefined);
});

test("missing-table errors are recognised so features degrade gracefully", () => {
  assert.equal(isMissingSchema({ code: "42P01" }), true);
  assert.equal(isMissingSchema({ code: "PGRST205" }), true);
  assert.equal(isMissingSchema({ message: 'column "tier" of relation "watchlist" does not exist' }), true);
  assert.equal(isMissingSchema({ message: "permission denied" }), false);
  assert.equal(isMissingSchema(null), false);
});

test("CV versions cover the three target roles", () => {
  assert.deepEqual(CV_FAMILIES.map((f) => f.id), ["gtm", "ae", "sdr"]);
  assert.equal(familyById("ae")?.label, "Associate AE");
  assert.equal(familyById("manager"), undefined);
});
