import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, TABS, MORE_LINKS, subLinksFor, tabIsActive, moreIsActive } from "../src/lib/nav-config";

test("the main menu is Jobs, Companies and Saved jobs", () => {
  assert.deepEqual(TABS.map((t) => t.label), ["Jobs", "Companies", "Saved jobs"]);
});

test("everything else is under More, together with the rarely used pages", () => {
  assert.deepEqual(MORE_LINKS.map((l) => l.label), ["Today", "People", "Copilots", "Applications", "Side income", "Chrome extension"]);
});

test("every page belongs to exactly one section", () => {
  const pages = ["/today", "/roles", "/companies", "/sources", "/saved", "/outreach", "/referrals", "/copilots", "/autopilot", "/pipeline", "/offers", "/pay", "/practice"];
  for (const p of pages) assert.equal(SECTIONS.filter((s) => tabIsActive(p, s)).length, 1, p);
});

test("a job or company detail page highlights its own tab", () => {
  assert.equal(tabIsActive("/roles/abc", TABS[0]), true);
  assert.equal(tabIsActive("/companies/abc", TABS[1]), true);
  assert.equal(tabIsActive("/roles/abc", TABS[1]), false);
});

test("More lights up on pages that live under it, not on main tabs", () => {
  for (const p of ["/today", "/outreach", "/referrals", "/copilots", "/offers", "/pay", "/practice", "/side-income", "/extension"]) assert.equal(moreIsActive(p), true, p);
  for (const p of ["/roles", "/companies", "/sources", "/saved", "/profile"]) assert.equal(moreIsActive(p), false, p);
});

test("the section strip appears only for sections with several pages", () => {
  assert.deepEqual(subLinksFor("/roles"), []);
  assert.deepEqual(subLinksFor("/saved"), []);
  assert.deepEqual(subLinksFor("/sources").map((l) => l.label), ["My companies", "Where roles come from"]);
  assert.deepEqual(subLinksFor("/referrals").map((l) => l.label), ["Messages", "Referrals"]);
  assert.deepEqual(subLinksFor("/offers").map((l) => l.label), ["To apply", "Pipeline", "Offers", "Practice", "Pay benchmark"]);
});
