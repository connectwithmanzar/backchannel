import { test } from "node:test";
import assert from "node:assert/strict";
import { averageRating, effectiveTier, suggestTier, tierFromRating } from "../src/lib/company-rating";
import { rating, researchQueries, reviewLinks, sanitizeResearch } from "../src/lib/company-research";
import { isTierConstraint } from "../src/lib/migration";

test("tier cut-offs: A 3.5+, B 3.0-3.4, C 2.5-2.9, D below 2.5", () => {
  assert.equal(tierFromRating(5), "A");
  assert.equal(tierFromRating(3.5), "A");
  assert.equal(tierFromRating(3.4), "B");
  assert.equal(tierFromRating(3.0), "B");
  assert.equal(tierFromRating(2.9), "C");
  assert.equal(tierFromRating(2.5), "C");
  assert.equal(tierFromRating(2.4), "D");
  assert.equal(tierFromRating(0), "D");
});

test("no rating means not rated, never a guess", () => {
  assert.equal(tierFromRating(null), null);
  assert.equal(tierFromRating(7), null);
  assert.deepEqual(suggestTier(null), { average: null, tier: null });
  assert.deepEqual(suggestTier({ glassdoor_rating: null, ambitionbox_rating: undefined }), { average: null, tier: null });
});

test("average uses the ratings you have, rounded to one decimal", () => {
  assert.equal(averageRating([4.0, null]), 4);
  assert.equal(averageRating([3.4, 3.6]), 3.5);
  assert.equal(averageRating([3.3, 3.4]), 3.4);
  assert.equal(averageRating([9, -1, undefined]), null);
  assert.deepEqual(suggestTier({ glassdoor_rating: 3.4, ambitionbox_rating: 3.6 }), { average: 3.5, tier: "A" });
});

test("your confirmed tier wins; otherwise the suggestion is labelled", () => {
  assert.deepEqual(effectiveTier("C", { glassdoor_rating: 4.5 }), { tier: "C", suggested: false });
  assert.deepEqual(effectiveTier(null, { glassdoor_rating: 4.5 }), { tier: "A", suggested: true });
  assert.deepEqual(effectiveTier(null, null), { tier: null, suggested: false });
  assert.deepEqual(effectiveTier("Z", { ambitionbox_rating: 2.0 }), { tier: "D", suggested: true });
});

test("research from the AI or the form is cleaned before it is used or saved", () => {
  const r = sanitizeResearch({
    website: "https://www.example.com/careers", hq: "  Bengaluru,   India ", work_mode: "Hybrid", hiring_locations: "N/A",
    pay_note: "INR 12-15 LPA fixed", perks: ["Family health cover", "family health cover", "", 7, "Learning budget"],
    summary: "x".repeat(900), glassdoor_rating: "3.8", ambitionbox_rating: 9, wlb_rating: 3.45, growth_rating: null,
    sources: { website: "https://example.com/about", pay_note: "javascript:alert(1)", bogus: "https://x.com", hq: "not a url" },
    sneaky: "ignored",
  });
  assert.equal(r.website, "example.com");
  assert.equal(r.hq, "Bengaluru, India");
  assert.equal(r.work_mode, "hybrid");
  assert.equal(r.hiring_locations, null);
  assert.deepEqual(r.perks, ["Family health cover", "family health cover", "Learning budget"]);
  assert.equal(r.summary?.length, 500);
  assert.equal(r.glassdoor_rating, 3.8);
  assert.equal(r.ambitionbox_rating, null);
  assert.equal(r.wlb_rating, 3.5);
  assert.deepEqual(r.sources, { website: "https://example.com/about" });
  assert.equal("sneaky" in r, false);
});

test("a bad work mode or empty input gives an empty, safe record", () => {
  assert.equal(sanitizeResearch({ work_mode: "on the moon" }).work_mode, null);
  assert.equal(sanitizeResearch(null).website, null);
  assert.equal(rating("abc"), null);
  assert.equal(rating(" 4.26 "), 4.3);
});

test("search queries are about work mode, pay and employee reviews, and review links are only links", () => {
  const q = researchQueries('Acme "Corp"', "acme.com");
  assert.equal(q.length, 3);
  assert.match(q[0], /work from home/);
  assert.match(q[1], /salary/);
  assert.match(q[2], /reviews/);
  assert.ok(q.every((x) => x.includes('"Acme Corp"')));
  const l = reviewLinks("Acme & Co");
  assert.match(l.glassdoor, /^https:\/\/www\.google\.com\/search\?q=/);
  assert.match(l.ambitionbox, /ambitionbox/);
});

test("a tier refused by the old A/B-only rule is recognised", () => {
  assert.equal(isTierConstraint({ code: "23514" }), true);
  assert.equal(isTierConstraint({ message: 'new row violates check constraint "watchlist_tier_check"' }), true);
  assert.equal(isTierConstraint({ message: "boom" }), false);
});
