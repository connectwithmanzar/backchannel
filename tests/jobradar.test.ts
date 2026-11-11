import { test } from "node:test";
import assert from "node:assert/strict";
import { validJobRadarListings, uniqueCompanies, MAX_JOBRADAR_JOBS } from "../src/lib/jobs/jobradar";

test("jobradar: keeps complete rows from known sites and drops the rest", () => {
  const rows = validJobRadarListings([
    { title: "SDR", company: "Acme", location: "Bangalore", url: "https://www.linkedin.com/jobs/view/1", site: "LinkedIn", description: "x" },
    { title: "BDR", company: "Beta", url: "https://www.naukri.com/job/2", site: "naukri" },
    { title: "AE", company: "", url: "https://x.com/3", site: "indeed" },
    { title: "AE", company: "Gamma", url: "http://insecure.com/4", site: "indeed" },
    { title: "AE", company: "Gamma", url: "https://ok.com/5", site: "monster" },
    { title: "SDR dup", company: "Acme", url: "https://www.linkedin.com/jobs/view/1", site: "linkedin" },
    null, "junk",
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].site, "linkedin");
  assert.equal(rows[1].location, "Not stated");
  assert.equal(rows[1].description, "");
});

test("jobradar: caps the batch and handles non-arrays", () => {
  assert.deepEqual(validJobRadarListings({ jobs: [] }), []);
  const many = Array.from({ length: 150 }, (_, i) => ({ title: "SDR", company: `C${i}`, url: `https://a.com/${i}`, site: "bayt" }));
  assert.equal(validJobRadarListings(many).length, MAX_JOBRADAR_JOBS);
});

test("jobradar: unique companies ignore case and punctuation", () => {
  assert.deepEqual(uniqueCompanies([{ company: "HubSpot" }, { company: "hubspot" }, { company: "Hub-Spot" }, { company: "Zoho" }]), ["HubSpot", "Hub-Spot", "Zoho"]);
  assert.equal(uniqueCompanies(Array.from({ length: 20 }, (_, i) => ({ company: `Co ${i}` })), 5).length, 5);
});
