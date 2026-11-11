import { test } from "node:test";
import assert from "node:assert/strict";
import { JOBRADAR_SITES, SITE_NAMES, validJobRadarListings } from "../src/lib/jobs/jobradar";
import { sourceLabel } from "../src/lib/role-filters";

test("the remote job feeds are accepted from JobRadar, with a readable name", () => {
  for (const site of ["remoteok", "weworkremotely", "himalayas", "remotive", "workingnomads"]) {
    assert.ok((JOBRADAR_SITES as readonly string[]).includes(site), site);
    const rows = validJobRadarListings([{ title: "Sales Development Representative", company: "Acme", url: `https://example.com/${site}`, site, location: "Remote (India)" }]);
    assert.equal(rows.length, 1, site);
    assert.equal(rows[0].site, site);
    assert.ok(SITE_NAMES[rows[0].site].length > 0);
    assert.doesNotMatch(sourceLabel(`jobradar:${site}`), /Other source/, site);
  }
});

test("an unknown site is still refused", () => {
  assert.equal(validJobRadarListings([{ title: "SDR", company: "Acme", url: "https://example.com/x", site: "mystery" }]).length, 0);
});

test("every site JobRadar can send has a display name", () => {
  for (const site of JOBRADAR_SITES) assert.ok(SITE_NAMES[site], site);
});
