import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCoverage, urlKey, viaLabel, type CoverageJob } from "../src/lib/coverage";

const job = (o: Partial<CoverageJob> & { id: string }): CoverageJob => ({ title: "Sales Development Representative", company: "Acme", url: `https://example.com/${o.id}`, source: null, ...o });

test("nothing saved by hand gives no score", () => {
  const c = computeCoverage([], [job({ id: "x" })]);
  assert.deepEqual({ total: c.total, found: c.found, rate: c.rate }, { total: 0, found: 0, rate: null });
});

test("a saved job counts as found when the same link exists from another source, even with tracking parameters", () => {
  const c = computeCoverage(
    [job({ id: "h1", url: "https://www.naukri.com/job/123?utm_source=x", title: "SDR", company: "Zeta" })],
    [job({ id: "o1", url: "https://naukri.com/job/123/", title: "Something else", company: "Other", source: "jobradar:naukri" })],
  );
  assert.equal(c.found, 1);
  assert.equal(c.rate, 100);
  assert.deepEqual(c.via, { "JobRadar · Naukri": 1 });
});

test("or when the company and title match, ignoring case, punctuation and company suffixes", () => {
  const c = computeCoverage(
    [job({ id: "h", title: "Business Development Representative (SDR)", company: "Freshworks Inc.", url: "https://a.com/1" })],
    [job({ id: "o", title: "business development representative  sdr", company: "Freshworks", url: "https://b.com/2", source: null })],
  );
  assert.equal(c.found, 1);
  assert.deepEqual(c.via, { "Company career page": 1 });
});

test("jobs only found by hand are listed as missed, and a pasted copy never counts as found", () => {
  const c = computeCoverage(
    [job({ id: "a", title: "Account Executive", company: "Globex", url: "https://g.com/a" }), job({ id: "b", title: "SDR", company: "Initech", url: "https://i.com/b" })],
    [job({ id: "dup", title: "Account Executive", company: "Globex", url: "https://g.com/a", source: "pasted" }), job({ id: "o", title: "SDR", company: "Initech", url: "https://x.com/y", source: "jobradar:linkedin" })],
  );
  assert.equal(c.total, 2);
  assert.equal(c.found, 1);
  assert.equal(c.rate, 50);
  assert.deepEqual(c.missed.map((m) => m.id), ["a"]);
});

test("link keys and source labels", () => {
  assert.equal(urlKey("https://www.Example.com/Jobs/1/?a=1#x"), "example.com/jobs/1");
  assert.equal(urlKey("not a link"), "");
  assert.equal(viaLabel("jobradar:remoteok"), "JobRadar · Remoteok");
  assert.equal(viaLabel(null), "Company career page");
});
