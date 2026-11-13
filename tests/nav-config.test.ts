import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, TABS, MORE_LINKS, subLinksFor, tabIsActive, moreIsActive } from "../src/lib/nav-config";

test("the main menu is Home, Jobs, Applied and Inbox", () => {
  assert.deepEqual(TABS.map((t) => t.label), ["Home", "Jobs", "Applied", "Inbox"]);
});

test("everything else is under More, together with the rarely used pages", () => {
  assert.deepEqual(MORE_LINKS.map((l) => l.label), ["Saved jobs", "Companies", "Today", "People", "Setup checklist", "Side income", "Chrome extension"]);
});

test("every page belongs to exactly one section", () => {
  const pages = ["/home", "/today", "/roles", "/swipe", "/companies", "/sources", "/saved", "/outreach", "/referrals", "/copilots", "/applications", "/inbox", "/autopilot", "/pipeline", "/offers", "/pay", "/practice"];
  for (const p of pages) assert.equal(SECTIONS.filter((s) => tabIsActive(p, s)).length, 1, p);
});

test("a job detail page highlights the Jobs tab", () => {
  assert.equal(tabIsActive("/roles/abc", TABS[1]), true);
  assert.equal(tabIsActive("/roles/abc", TABS[0]), false);
});

test("More lights up on pages that live under it, not on main tabs", () => {
  for (const p of ["/saved", "/companies", "/today", "/outreach", "/referrals", "/welcome", "/side-income", "/extension"]) assert.equal(moreIsActive(p), true, p);
  for (const p of ["/home", "/copilots", "/roles", "/swipe", "/applications", "/offers", "/inbox", "/profile"]) assert.equal(moreIsActive(p), false, p);
});

test("the section strip appears only for sections with several pages", () => {
  assert.deepEqual(subLinksFor("/roles").map((l) => l.label), ["Swipe", "Grid", "List with filters"]);
  assert.deepEqual(subLinksFor("/inbox"), []);
  assert.deepEqual(subLinksFor("/home"), []);
  assert.deepEqual(subLinksFor("/sources").map((l) => l.label), ["My companies", "Where roles come from"]);
  assert.deepEqual(subLinksFor("/offers").map((l) => l.label), ["Tracker", "Auto-apply", "Pipeline", "Offers", "Practice", "Pay benchmark"]);
});
