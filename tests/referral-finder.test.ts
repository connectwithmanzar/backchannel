import { test } from "node:test";
import assert from "node:assert/strict";
import { findReferralPaths, linkedinSearchUrl, sizeBucket, targetsFor } from "../src/lib/referral-finder";
import type { Connection } from "../src/lib/jobs/referral-paths";

const conn = (o: Partial<Connection>): Connection => ({ full_name: "Sam", company: "Harvey", position: "Account Executive", linkedin_url: "https://www.linkedin.com/in/sam", connected_on: "2025-01-01", ...o });

test("company size text becomes a bucket", () => {
  assert.equal(sizeBucket("11-50 employees"), "small");
  assert.equal(sizeBucket("51-200"), "small");
  assert.equal(sizeBucket("201-500"), "mid");
  assert.equal(sizeBucket("1,001-5,000 employees"), "large");
  assert.equal(sizeBucket("10000+"), "large");
  assert.equal(sizeBucket("unknown"), null);
  assert.equal(sizeBucket(null), null);
});

test("a small company points at founders and leaders first, a large one at similar titles first", () => {
  assert.deepEqual(targetsFor("small", "SDR").map((t) => t.key).slice(0, 2), ["founders", "sales-leader"]);
  assert.equal(targetsFor("large", "Account Executive")[0].key, "peers");
  assert.equal(targetsFor("large", "Account Executive")[0].keywords, "Account Executive");
  assert.equal(targetsFor("mid", "SDR")[0].key, "manager");
  assert.ok(targetsFor("large", "SDR").some((t) => t.key === "recruiter"));
});

test("search links carry the company, the title keywords and the connection degree", () => {
  const first = linkedinSearchUrl({ company: "Harvey", keywords: "Head of Sales", degree: "1st" });
  assert.match(first, /keywords=Harvey%20Head%20of%20Sales/);
  assert.match(first, /network=%5B%22F%22%5D/);
  assert.match(linkedinSearchUrl({ company: "Harvey", keywords: "Head of Sales", degree: "2nd" }), /%22S%22/);
  assert.doesNotMatch(linkedinSearchUrl({ company: "Harvey", keywords: "x" }), /network=/);
  assert.match(linkedinSearchUrl({ company: "Harvey", keywords: "x", location: "Bengaluru" }), /Bengaluru/);
});

test("mutuals come from your own connections at that company, best person first", () => {
  const r = findReferralPaths({
    company: "Harvey", roleTitle: "Account Executive", size: "mid",
    connections: [conn({ full_name: "Rec", position: "Recruiter" }), conn({ full_name: "Head", position: "Head of Sales" }), conn({ full_name: "Else", company: "Other Co" })],
  });
  assert.deepEqual(r.mutuals.map((c) => c.full_name), ["Head", "Rec"]);
});

test("each group lists 1st-degree and 2nd-degree searches before the open search", () => {
  const r = findReferralPaths({ company: "Harvey", roleTitle: "SDR", size: "small", location: "Delhi", connections: [] });
  assert.ok(r.groups.length >= 4);
  for (const g of r.groups) {
    assert.deepEqual(g.links.map((l) => l.label.split(" ")[0]), ["People", "Friends", "Anyone"]);
    assert.match(g.links[2].label, /Delhi/);
  }
});

test("no company gives nothing, and your own employer is never searched", () => {
  assert.deepEqual(findReferralPaths({ company: "  ", roleTitle: "SDR", size: "mid", connections: [] }).groups, []);
});
