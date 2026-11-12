import { test } from "node:test";
import assert from "node:assert/strict";
import { toMarket, countryToMarkets } from "../src/lib/jobs/market";
import { detectMarket } from "../src/lib/jobs/location";

// Real place names found on the live Jobs page that were wrongly filed as "global".
test("US places written as a state or city are US, not global", () => {
  for (const place of ["Illinois Remote Work, More...", "Connecticut Remote Work, More...", "Washington Remote Work", "Texas Remote Work", "Indiana Remote Work, More...", "Greater Denver Area", "Los Angeles, CA", "Hybrid - San Diego", "US - GA, Alpharetta", "US - Remote, OR", "New England Remote"]) {
    assert.equal(detectMarket(place), "US", place);
    assert.equal(toMarket("Remote", "remote", place), "us", place);
  }
});

test("older rows stored as Remote, Other or Unknown are read again from the place name", () => {
  assert.equal(toMarket("Other", "hybrid", "Seattle, Washington, United States"), "us");
  assert.equal(toMarket("Unknown", "unknown", "Pune, Maharashtra"), "india");
  assert.equal(toMarket("Remote", "remote", "Remote - Bengaluru"), "remote-in");
  assert.equal(toMarket("Other", "onsite", "Riyadh"), "emea");
  assert.equal(toMarket("Other", "onsite", "Ontario,Canada Offsite, More..."), "us");   // Canada counts with the US group
});

test("other countries are 'other', even when the role says remote", () => {
  assert.equal(toMarket("Other", "hybrid", "Bogota, Cundinamarca, Colombia"), "other");
  assert.equal(toMarket("Other", "onsite", "São Paulo, São Paulo, Brazil"), "other");
  assert.equal(toMarket("Singapore", "remote", "Remote - Singapore"), "other");
  assert.equal(toMarket("Australia", "hybrid", "Sydney"), "other");
});

test("only remote roles with no place, or 'anywhere', are global", () => {
  assert.equal(toMarket("Remote", "remote", "Remote"), "global");
  assert.equal(toMarket(null, "remote", ""), "global");
  assert.equal(toMarket("Remote", "unknown", "Anywhere"), "global");
  assert.equal(toMarket("Unknown", "unknown", ""), "other");
  assert.equal(toMarket("Other", "unknown", "3 Locations"), "other");
  assert.equal(toMarket("Other", "hybrid", "Hybrid"), "other");
});

test("known countries keep their group", () => {
  assert.equal(toMarket("India", "remote", "Remote - India"), "remote-in");
  assert.equal(toMarket("India", "hybrid", "Gurugram"), "india");
  assert.equal(toMarket("UK", "hybrid", "London, UK"), "emea");
  assert.equal(toMarket("UAE", "onsite", "Dubai"), "emea");
  assert.equal(toMarket("US", "remote", "Remote - United States"), "us");
  assert.equal(toMarket("Africa", "onsite", "Lagos"), "emea");
});

test("new place rules do not steal existing ones", () => {
  assert.equal(detectMarket("Remote - India"), "India");
  assert.equal(detectMarket("London, UK"), "UK");
  assert.equal(detectMarket("Austin, TX"), "US");
  assert.equal(detectMarket("Brussels, Belgium"), "Europe");
  assert.equal(detectMarket("Remote"), "Remote");
  assert.equal(detectMarket(""), "Unknown");
  assert.equal(detectMarket("Atlantis"), "Other");
  assert.equal(detectMarket("Georgia, Tbilisi"), "US");   // known limit: a US state name wins over the country of Georgia
});

test("the scorecard's own market choices map to the right groups", () => {
  assert.deepEqual(countryToMarkets("India (onsite)"), ["india"]);
  assert.deepEqual(countryToMarkets("India (hybrid)"), ["india"]);
  assert.deepEqual(countryToMarkets("India"), ["india", "remote-in"]);
  assert.deepEqual(countryToMarkets("Remote India→US"), ["global", "remote-in"]);
  assert.deepEqual(countryToMarkets("Remote India→EU"), ["global", "remote-in"]);
  assert.deepEqual(countryToMarkets("UAE"), ["emea"]);
  assert.deepEqual(countryToMarkets("UK"), ["emea"]);
  assert.deepEqual(countryToMarkets("Singapore"), ["other"]);
  assert.deepEqual(countryToMarkets("United States"), ["us"]);
});
