import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS, MORE_LINKS, subLinksFor, tabIsActive } from "../src/lib/nav-config";

test("navigation has five tabs", () => {
  assert.deepEqual(TABS.map((t) => t.label), ["Today", "Jobs", "Companies", "People", "Applications"]);
});

test("every page belongs to exactly one tab", () => {
  const pages = ["/today", "/roles", "/companies", "/sources", "/outreach", "/referrals", "/autopilot", "/pipeline", "/offers", "/pay", "/practice"];
  for (const p of pages) assert.equal(TABS.filter((t) => tabIsActive(p, t)).length, 1, p);
  assert.deepEqual(MORE_LINKS.map((l) => l.href), ["/side-income", "/extension"]);
});

test("a job detail page highlights Jobs only", () => {
  assert.equal(tabIsActive("/roles/abc", TABS[1]), true);
  assert.equal(tabIsActive("/roles/abc", TABS[0]), false);
});

test("the section strip appears only for tabs with several pages", () => {
  assert.deepEqual(subLinksFor("/today"), []);
  assert.deepEqual(subLinksFor("/referrals").map((l) => l.label), ["Messages", "Referrals"]);
  assert.deepEqual(subLinksFor("/offers").map((l) => l.label), ["To apply", "Pipeline", "Offers", "Practice", "Pay benchmark"]);
});
