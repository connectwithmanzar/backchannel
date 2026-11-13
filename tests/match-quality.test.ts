import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchProfile, freshnessFit, levelFit, levelsFromTitles, scoreJob } from "../src/lib/score";
import type { Job } from "../src/lib/collector/types";

const job = (o: Partial<Job> = {}): Job => ({
  id: "1", company: "Acme", title: "Senior SDR", location: "Delhi", remoteType: "hybrid", market: "india", sourceType: "careers", board: "x", url: "u",
  lastCheckedAt: "2026-11-13T00:00:00Z", roleFamily: "SDR/BDR", description: "Outbound with Salesforce", payBandStatus: "unknown", visaSponsorship: "unknown", ...o,
} as Job);
const profile = buildSearchProfile({ name: "M", tools: ["Salesforce"], markets: ["India"], target_titles: ["Senior SDR", "Account Executive"], min_ote_usd: 0 });

test("levels are read from the titles you target", () => {
  assert.deepEqual(new Set(levelsFromTitles(["Senior SDR", "Account Executive"])), new Set(["senior", "mid"]));
  assert.deepEqual(levelsFromTitles([]), ["entry", "mid", "senior"]);
  assert.deepEqual(levelsFromTitles(null), ["entry", "mid", "senior"]);
});

test("leadership you did not ask for is a poor level fit, a wanted level is perfect", () => {
  assert.equal(levelFit("Senior SDR", ["senior", "mid"]), 100);
  assert.equal(levelFit("Head of Sales", ["senior", "mid"]), 20);
  assert.equal(levelFit("Sales Manager", ["lead"]), 100);
  assert.equal(levelFit("Associate AE", ["senior"]), 25);
  assert.equal(levelFit("Account Executive", undefined), 70);
});

test("newer postings score higher and an unknown date is neutral", () => {
  const now = Date.parse("2026-11-13T00:00:00Z");
  assert.equal(freshnessFit("2026-11-12T00:00:00Z", now), 100);
  assert.equal(freshnessFit("2026-11-01T00:00:00Z", now), 85);
  assert.equal(freshnessFit("2026-10-20T00:00:00Z", now), 60);
  assert.equal(freshnessFit("2026-09-01T00:00:00Z", now), 15);
  assert.equal(freshnessFit(undefined, now), 60);
});

test("a role at the right level scores above the same role at leadership level", () => {
  const right = scoreJob(job({ title: "Senior SDR" }), profile).score;
  const lead = scoreJob(job({ title: "Head of Sales Development", roleFamily: "SDR/BDR" }), profile).score;
  assert.ok(right > lead, `${right} should beat ${lead}`);
});

test("a fresh posting beats a stale one, everything else equal", () => {
  const fresh = scoreJob(job({ postedAt: new Date().toISOString() }), profile).score;
  const stale = scoreJob(job({ postedAt: new Date(Date.now() - 90 * 864e5).toISOString() }), profile).score;
  assert.ok(fresh > stale);
});

test("reasons and caveats are separate, and the sentence leads with reasons then 'Watch out'", () => {
  const s = scoreJob(job({ title: "Head of Sales Development", postedAt: new Date(Date.now() - 90 * 864e5).toISOString() }), profile);
  assert.ok(s.reasons.length > 0);
  assert.ok(s.caveats.some((c) => /leadership/.test(c)));
  assert.ok(s.caveats.some((c) => /old/.test(c)));
  assert.match(s.explanation, /Watch out: /);
  const good = scoreJob(job({ postedAt: new Date().toISOString() }), profile);
  assert.match(good.explanation, /it mentions Salesforce/);
});
