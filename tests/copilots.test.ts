import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCopilotInput, expandTitle, matchesCopilot, titleMatches, titleSeniority, keptWords, keptScore, describeWhere, type CopilotInput } from "../src/lib/copilots";

const base: CopilotInput = { name: "", titles: ["sales development"], remote: true, remoteRegions: [], onsite: false, places: [], seniority: [], excludeWords: [] };

test("a wanted title fits when every word starts a word in the job title", () => {
  assert.equal(titleMatches("sales development", "Sales Development Representative"), true);
  assert.equal(titleMatches("gtm", "GTM Engineer"), true);
  assert.equal(titleMatches("sales development", "Development Manager, Sales"), true);
  assert.equal(titleMatches("sales development", "Software Developer"), false);
  assert.equal(titleMatches("", "Anything"), false);
});

test("levels are read from the title; no level word means mid", () => {
  assert.equal(titleSeniority("Senior SDR"), "senior");
  assert.equal(titleSeniority("Sales Development Intern"), "entry");
  assert.equal(titleSeniority("Associate Account Executive"), "junior");
  assert.equal(titleSeniority("Sales Team Lead"), "lead");
  assert.equal(titleSeniority("Head of Sales"), "director");
  assert.equal(titleSeniority("Business Development Representative"), "mid");
});

test("cleaning needs a title and a place type, trims, removes repeats and caps titles at five", () => {
  assert.equal(cleanCopilotInput({ titles: [], remote: true }).ok, false);
  assert.equal(cleanCopilotInput({ titles: ["SDR"], remote: false, onsite: false }).ok, false);
  const r = cleanCopilotInput({ titles: [" SDR ", "sdr", "BDR", "a", "b", "c", "d"], remote: true, remoteRegions: ["India"], onsite: false, places: ["Pune"], seniority: ["senior", "wizard"] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value.titles, ["SDR", "BDR", "a", "b", "c"]);
    assert.deepEqual(r.value.places, []);
    assert.deepEqual(r.value.seniority, ["senior"]);
    assert.equal(r.value.name, "SDR, BDR");
  }
});

test("remote jobs need remote switched on and respect the regions", () => {
  const job = { title: "Sales Development Representative", location: "Remote - India", remote_type: "remote" };
  assert.equal(matchesCopilot(base, job), true);
  assert.equal(matchesCopilot({ ...base, remote: false, onsite: true }, job), false);
  assert.equal(matchesCopilot({ ...base, remoteRegions: ["India"] }, job), true);
  assert.equal(matchesCopilot({ ...base, remoteRegions: ["Germany"] }, job), false);
  assert.equal(matchesCopilot({ ...base, remoteRegions: ["Germany"] }, { ...job, location: "Remote - Worldwide" }), true);
  assert.equal(matchesCopilot({ ...base, remoteRegions: ["Germany"] }, { ...job, location: "" }), true);
});

test("on-site jobs need on-site switched on and a matching place", () => {
  const job = { title: "Business Development Representative", location: "Pune, India", remote_type: "onsite" };
  const c = { ...base, titles: ["business development"], remote: false, onsite: true };
  assert.equal(matchesCopilot(c, job), true);
  assert.equal(matchesCopilot({ ...c, places: ["Pune"] }, job), true);
  assert.equal(matchesCopilot({ ...c, places: ["Mumbai"] }, job), false);
  assert.equal(matchesCopilot({ ...c, onsite: false, remote: true }, job), false);
});

test("level and avoid-words filters apply", () => {
  const job = { title: "Senior Sales Development Representative", location: "Remote", remote_type: "remote" };
  assert.equal(matchesCopilot({ ...base, seniority: ["senior"] }, job), true);
  assert.equal(matchesCopilot({ ...base, seniority: ["junior", "mid"] }, job), false);
  assert.equal(matchesCopilot({ ...base, excludeWords: ["senior"] }, job), false);
});

test("jobs like the ones you kept score higher", () => {
  const kept = keptWords(["Outbound Sales Development Representative", "SaaS Business Development Representative"]);
  assert.ok(keptScore("Sales Development Representative", kept) > keptScore("Warehouse Operator", kept));
  assert.equal(keptScore("Anything", keptWords([])), 0);
});

test("the card line says where a Copilot looks", () => {
  assert.equal(describeWhere({ remote: true, remoteRegions: [], onsite: false, places: [] }), "Remote anywhere");
  assert.equal(describeWhere({ remote: true, remoteRegions: ["India"], onsite: true, places: ["Pune", "Delhi"] }), "Remote India · On-site Pune, Delhi");
});

test("common short forms count: sales development finds SDR, and short words must match whole", () => {
  assert.ok(expandTitle("sales development").includes("sdr"));
  assert.ok(expandTitle("SDR").includes("sales development") || expandTitle("SDR").some((a) => a.includes("sales development")));
  assert.equal(titleMatches("sales development", "Senior SDR"), true);
  assert.equal(titleMatches("account executive", "Enterprise AE"), true);
  assert.equal(titleMatches("account executive", "Aerospace Engineer"), false);
  assert.equal(titleMatches("gtm", "Gtmx Analyst"), false);
});
